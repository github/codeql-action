import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import * as actionsCache from "@actions/cache";

import { getRequiredInput, getTemporaryDirectory } from "./actions-util";
import { getAutomationID } from "./api-client";
import { type CodeQL } from "./codeql";
import { type Config } from "./config-utils";
import { getCommitOid, getFileOidsUnderPath } from "./git-utils";
import { Logger, withGroupAsync } from "./logging";
import {
  isInTestMode,
  tryGetFolderBytes,
  waitForResultWithTimeLimit,
} from "./util";

export enum OverlayDatabaseMode {
  Overlay = "overlay",
  OverlayBase = "overlay-base",
  None = "none",
}

export const CODEQL_OVERLAY_MINIMUM_VERSION = "2.22.4";

/**
 * The maximum (uncompressed) size of the overlay base database that we will
 * upload. By default, the Actions Cache has an overall capacity of 10 GB, and
 * the Actions Cache client library uses zstd compression.
 *
 * Ideally we would apply a size limit to the compressed overlay-base database,
 * but we cannot do so because compression is handled transparently by the
 * Actions Cache client library. Instead we place a limit on the uncompressed
 * size of the overlay-base database.
 *
 * Assuming 2.5:1 compression ratio, the 15 GB limit on uncompressed data would
 * translate to a limit of around 6 GB after compression. This is a high limit
 * compared to the default 10GB Actions Cache capacity, but enforcement of Actions
 * Cache quotas is not immediate.
 *
 * TODO: revisit this limit before removing the restriction for overlay analysis
 * to the `github` and `dsp-testing` orgs.
 */
const OVERLAY_BASE_DATABASE_MAX_UPLOAD_SIZE_MB = 15000;
const OVERLAY_BASE_DATABASE_MAX_UPLOAD_SIZE_BYTES =
  OVERLAY_BASE_DATABASE_MAX_UPLOAD_SIZE_MB * 1_000_000;

/**
 * Writes a JSON file containing Git OIDs for all tracked files (represented
 * by path relative to the source root) under the source root. The file is
 * written into the database location specified in the config.
 *
 * @param config The configuration object containing the database location
 * @param sourceRoot The root directory containing the source files to process
 * @throws {Error} If the Git repository root cannot be determined
 */
export async function writeBaseDatabaseOidsFile(
  config: Config,
  sourceRoot: string,
): Promise<void> {
  const gitFileOids = await getFileOidsUnderPath(sourceRoot);
  const gitFileOidsJson = JSON.stringify(gitFileOids);
  const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
  await fs.promises.writeFile(baseDatabaseOidsFilePath, gitFileOidsJson);
}

/**
 * Reads and parses the JSON file containing the base database Git OIDs.
 * This file contains the mapping of file paths to their corresponding Git OIDs
 * that was previously written by writeBaseDatabaseOidsFile().
 *
 * @param config The configuration object containing the database location
 * @param logger The logger instance to use for error reporting
 * @returns An object mapping file paths (relative to source root) to their Git OIDs
 * @throws {Error} If the file cannot be read or parsed
 */
async function readBaseDatabaseOidsFile(
  config: Config,
  logger: Logger,
): Promise<{ [key: string]: string }> {
  const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
  try {
    const contents = await fs.promises.readFile(
      baseDatabaseOidsFilePath,
      "utf-8",
    );
    return JSON.parse(contents) as { [key: string]: string };
  } catch (e) {
    logger.error(
      "Failed to read overlay-base file OIDs from " +
        `${baseDatabaseOidsFilePath}: ${(e as any).message || e}`,
    );
    throw e;
  }
}

function getBaseDatabaseOidsFilePath(config: Config): string {
  return path.join(config.dbLocation, "base-database-oids.json");
}

/**
 * Writes a JSON file containing the source-root-relative paths of files under
 * `sourceRoot` that have changed (added, removed, or modified) from the overlay
 * base database.
 *
 * This function uses the Git index to determine which files have changed, so it
 * requires the following preconditions, both when this function is called and
 * when the overlay-base database was initialized:
 *
 * - It requires that `sourceRoot` is inside a Git repository.
 * - It assumes that all changes in the working tree are staged in the index.
 * - It assumes that all files of interest are tracked by Git, e.g. not covered
 *   by `.gitignore`.
 */
export async function writeOverlayChangesFile(
  config: Config,
  sourceRoot: string,
  logger: Logger,
): Promise<string> {
  const baseFileOids = await readBaseDatabaseOidsFile(config, logger);
  const overlayFileOids = await getFileOidsUnderPath(sourceRoot);
  const changedFiles = computeChangedFiles(baseFileOids, overlayFileOids);
  logger.info(
    `Found ${changedFiles.length} changed file(s) under ${sourceRoot}.`,
  );

  const changedFilesJson = JSON.stringify({ changes: changedFiles });
  const overlayChangesFile = path.join(
    getTemporaryDirectory(),
    "overlay-changes.json",
  );
  logger.debug(
    `Writing overlay changed files to ${overlayChangesFile}: ${changedFilesJson}`,
  );
  await fs.promises.writeFile(overlayChangesFile, changedFilesJson);
  return overlayChangesFile;
}

function computeChangedFiles(
  baseFileOids: { [key: string]: string },
  overlayFileOids: { [key: string]: string },
): string[] {
  const changes: string[] = [];
  for (const [file, oid] of Object.entries(overlayFileOids)) {
    if (!(file in baseFileOids) || baseFileOids[file] !== oid) {
      changes.push(file);
    }
  }
  for (const file of Object.keys(baseFileOids)) {
    if (!(file in overlayFileOids)) {
      changes.push(file);
    }
  }
  return changes;
}

// Constants for database caching
const CACHE_VERSION = 1;
const CACHE_PREFIX = "codeql-overlay-base-database";

// The purpose of this ten-minute limit is to guard against the possibility
// that the cache service is unresponsive, which would otherwise cause the
// entire action to hang.  Normally we expect cache operations to complete
// within two minutes.
const MAX_CACHE_OPERATION_MS = 600_000;

/**
 * Checks that the overlay-base database is valid by checking for the
 * existence of the base database OIDs file.
 *
 * @param config The configuration object
 * @param logger The logger instance
 * @param warningPrefix Prefix for the check failure warning message
 * @returns True if the verification succeeded, false otherwise
 */
export function checkOverlayBaseDatabase(
  config: Config,
  logger: Logger,
  warningPrefix: string,
): boolean {
  // An overlay-base database should contain the base database OIDs file.
  const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
  if (!fs.existsSync(baseDatabaseOidsFilePath)) {
    logger.warning(
      `${warningPrefix}: ${baseDatabaseOidsFilePath} does not exist`,
    );
    return false;
  }
  return true;
}

/**
 * Uploads the overlay-base database to the GitHub Actions cache. If conditions
 * for uploading are not met, the function does nothing and returns false.
 *
 * This function uses the `checkout_path` input to determine the repository path
 * and works only when called from `analyze` or `upload-sarif`.
 *
 * @param codeql The CodeQL instance
 * @param config The configuration object
 * @param logger The logger instance
 * @returns A promise that resolves to true if the upload was performed and
 * successfully completed, or false otherwise
 */
export async function uploadOverlayBaseDatabaseToCache(
  codeql: CodeQL,
  config: Config,
  logger: Logger,
): Promise<boolean> {
  const overlayDatabaseMode = config.overlayDatabaseMode;
  if (overlayDatabaseMode !== OverlayDatabaseMode.OverlayBase) {
    logger.debug(
      `Overlay database mode is ${overlayDatabaseMode}. ` +
        "Skip uploading overlay-base database to cache.",
    );
    return false;
  }
  if (!config.useOverlayDatabaseCaching) {
    logger.debug(
      "Overlay database caching is disabled. " +
        "Skip uploading overlay-base database to cache.",
    );
    return false;
  }
  if (isInTestMode()) {
    logger.debug(
      "In test mode. Skip uploading overlay-base database to cache.",
    );
    return false;
  }

  const databaseIsValid = checkOverlayBaseDatabase(
    config,
    logger,
    "Abort uploading overlay-base database to cache",
  );
  if (!databaseIsValid) {
    return false;
  }

  // Clean up the database using the overlay cleanup level.
  await withGroupAsync("Cleaning up databases", async () => {
    await codeql.databaseCleanupCluster(config, "overlay");
  });

  const dbLocation = config.dbLocation;

  const databaseSizeBytes = await tryGetFolderBytes(dbLocation, logger);
  if (databaseSizeBytes === undefined) {
    logger.warning(
      "Failed to determine database size. " +
        "Skip uploading overlay-base database to cache.",
    );
    return false;
  }

  if (databaseSizeBytes > OVERLAY_BASE_DATABASE_MAX_UPLOAD_SIZE_BYTES) {
    const databaseSizeMB = Math.round(databaseSizeBytes / 1_000_000);
    logger.warning(
      `Database size (${databaseSizeMB} MB) ` +
        `exceeds maximum upload size (${OVERLAY_BASE_DATABASE_MAX_UPLOAD_SIZE_MB} MB). ` +
        "Skip uploading overlay-base database to cache.",
    );
    return false;
  }

  const codeQlVersion = (await codeql.getVersion()).version;
  const checkoutPath = getRequiredInput("checkout_path");
  const cacheSaveKey = await getCacheSaveKey(
    config,
    codeQlVersion,
    checkoutPath,
  );
  logger.info(
    `Uploading overlay-base database to Actions cache with key ${cacheSaveKey}`,
  );

  try {
    const cacheId = await waitForResultWithTimeLimit(
      MAX_CACHE_OPERATION_MS,
      actionsCache.saveCache([dbLocation], cacheSaveKey),
      () => {},
    );
    if (cacheId === undefined) {
      logger.warning("Timed out while uploading overlay-base database");
      return false;
    }
  } catch (error) {
    logger.warning(
      "Failed to upload overlay-base database to cache: " +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
  logger.info(`Successfully uploaded overlay-base database from ${dbLocation}`);
  return true;
}

export interface OverlayBaseDatabaseDownloadStats {
  databaseSizeBytes: number;
  databaseDownloadDurationMs: number;
}

/**
 * Downloads the overlay-base database from the GitHub Actions cache. If conditions
 * for downloading are not met, the function does nothing and returns false.
 *
 * @param codeql The CodeQL instance
 * @param config The configuration object
 * @param logger The logger instance
 * @returns A promise that resolves to download statistics if an overlay-base
 * database was successfully downloaded, or undefined if the download was
 * either not performed or failed.
 */
export async function downloadOverlayBaseDatabaseFromCache(
  codeql: CodeQL,
  config: Config,
  logger: Logger,
): Promise<OverlayBaseDatabaseDownloadStats | undefined> {
  const overlayDatabaseMode = config.overlayDatabaseMode;
  if (overlayDatabaseMode !== OverlayDatabaseMode.Overlay) {
    logger.debug(
      `Overlay database mode is ${overlayDatabaseMode}. ` +
        "Skip downloading overlay-base database from cache.",
    );
    return undefined;
  }
  if (!config.useOverlayDatabaseCaching) {
    logger.debug(
      "Overlay database caching is disabled. " +
        "Skip downloading overlay-base database from cache.",
    );
    return undefined;
  }
  if (isInTestMode()) {
    logger.debug(
      "In test mode. Skip downloading overlay-base database from cache.",
    );
    return undefined;
  }

  const dbLocation = config.dbLocation;
  const codeQlVersion = (await codeql.getVersion()).version;
  const cacheRestoreKeyPrefix = await getCacheRestoreKeyPrefix(
    config,
    codeQlVersion,
  );

  logger.info(
    "Looking in Actions cache for overlay-base database with " +
      `restore key ${cacheRestoreKeyPrefix}`,
  );

  let databaseDownloadDurationMs = 0;
  try {
    const databaseDownloadStart = performance.now();
    const foundKey = await waitForResultWithTimeLimit(
      // This ten-minute limit for the cache restore operation is mainly to
      // guard against the possibility that the cache service is unresponsive
      // and hangs outside the data download.
      //
      // Data download (which is normally the most time-consuming part of the
      // restore operation) should not run long enough to hit this limit. Even
      // for an extremely large 10GB database, at a download speed of 40MB/s
      // (see below), the download should complete within five minutes. If we
      // do hit this limit, there are likely more serious problems other than
      // mere slow download speed.
      //
      // This is important because we don't want any ongoing file operations
      // on the database directory when we do hit this limit. Hitting this
      // time limit takes us to a fallback path where we re-initialize the
      // database from scratch at dbLocation, and having the cache restore
      // operation continue to write into dbLocation in the background would
      // really mess things up. We want to hit this limit only in the case
      // of a hung cache service, not just slow download speed.
      MAX_CACHE_OPERATION_MS,
      actionsCache.restoreCache(
        [dbLocation],
        cacheRestoreKeyPrefix,
        undefined,
        {
          // Azure SDK download (which is the default) uses 128MB segments; see
          // https://github.com/actions/toolkit/blob/main/packages/cache/README.md.
          // Setting segmentTimeoutInMs to 3000 translates to segment download
          // speed of about 40 MB/s, which should be achievable unless the
          // download is unreliable (in which case we do want to abort).
          segmentTimeoutInMs: 3000,
        },
      ),
      () => {
        logger.info("Timed out downloading overlay-base database from cache");
      },
    );
    databaseDownloadDurationMs = Math.round(
      performance.now() - databaseDownloadStart,
    );

    if (foundKey === undefined) {
      logger.info("No overlay-base database found in Actions cache");
      return undefined;
    }

    logger.info(
      `Downloaded overlay-base database in cache with key ${foundKey}`,
    );
  } catch (error) {
    logger.warning(
      "Failed to download overlay-base database from cache: " +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }

  const databaseIsValid = checkOverlayBaseDatabase(
    config,
    logger,
    "Downloaded overlay-base database is invalid",
  );
  if (!databaseIsValid) {
    logger.warning("Downloaded overlay-base database failed validation");
    return undefined;
  }

  const databaseSizeBytes = await tryGetFolderBytes(dbLocation, logger);
  if (databaseSizeBytes === undefined) {
    logger.info(
      "Filesystem error while accessing downloaded overlay-base database",
    );
    // The problem that warrants reporting download failure is not that we are
    // unable to determine the size of the database. Rather, it is that we
    // encountered a filesystem error while accessing the database, which
    // indicates that an overlay analysis will likely fail.
    return undefined;
  }

  logger.info(`Successfully downloaded overlay-base database to ${dbLocation}`);
  return {
    databaseSizeBytes: Math.round(databaseSizeBytes),
    databaseDownloadDurationMs,
  };
}

/**
 * Computes the cache key for saving the overlay-base database to the GitHub
 * Actions cache.
 *
 * The key consists of the restore key prefix (which does not include the
 * commit SHA) and the commit SHA of the current checkout.
 */
async function getCacheSaveKey(
  config: Config,
  codeQlVersion: string,
  checkoutPath: string,
): Promise<string> {
  const sha = await getCommitOid(checkoutPath);
  const restoreKeyPrefix = await getCacheRestoreKeyPrefix(
    config,
    codeQlVersion,
  );
  return `${restoreKeyPrefix}${sha}`;
}

/**
 * Computes the cache key prefix for restoring the overlay-base database from
 * the GitHub Actions cache.
 *
 * Actions cache supports using multiple restore keys to indicate preference,
 * and this function could in principle take advantage of that feature by
 * returning a list of restore key prefixes. However, since overlay-base
 * databases are built from the default branch and used in PR analysis, it is
 * exceedingly unlikely that the commit SHA will ever be the same.
 *
 * Therefore, this function returns only a single restore key prefix, which does
 * not include the commit SHA. This allows us to restore the most recent
 * compatible overlay-base database.
 */
async function getCacheRestoreKeyPrefix(
  config: Config,
  codeQlVersion: string,
): Promise<string> {
  const languages = [...config.languages].sort().join("_");

  const cacheKeyComponents = {
    automationID: await getAutomationID(),
    // Add more components here as needed in the future
  };
  const componentsHash = createCacheKeyHash(cacheKeyComponents);

  // For a cached overlay-base database to be considered compatible for overlay
  // analysis, all components in the cache restore key must match:
  //
  // CACHE_PREFIX: distinguishes overlay-base databases from other cache objects
  // CACHE_VERSION: cache format version
  // componentsHash: hash of additional components (see above for details)
  // languages: the languages included in the overlay-base database
  // codeQlVersion: CodeQL bundle version
  //
  // Technically we can also include languages and codeQlVersion in the
  // componentsHash, but including them explicitly in the cache key makes it
  // easier to debug and understand the cache key structure.
  return `${CACHE_PREFIX}-${CACHE_VERSION}-${componentsHash}-${languages}-${codeQlVersion}-`;
}

/**
 * Creates a SHA-256 hash of the cache key components to ensure uniqueness
 * while keeping the cache key length manageable.
 *
 * @param components Object containing all components that should influence cache key uniqueness
 * @returns A short SHA-256 hash (first 16 characters) of the components
 */
function createCacheKeyHash(components: Record<string, any>): string {
  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
  //
  // "Properties are visited using the same algorithm as Object.keys(), which
  // has a well-defined order and is stable across implementations. For example,
  // JSON.stringify on the same object will always produce the same string, and
  // JSON.parse(JSON.stringify(obj)) would produce an object with the same key
  // ordering as the original (assuming the object is completely
  // JSON-serializable)."
  const componentsJson = JSON.stringify(components);
  return crypto
    .createHash("sha256")
    .update(componentsJson)
    .digest("hex")
    .substring(0, 16);
}
