import * as fs from "fs";
import * as path from "path";

import * as actionsCache from "@actions/cache";

import { getRequiredInput, getTemporaryDirectory } from "./actions-util";
import { type CodeQL } from "./codeql";
import { type Config } from "./config-utils";
import { getCommitOid, getFileOidsUnderPath } from "./git-utils";
import { Logger } from "./logging";
import { isInTestMode, withTimeout } from "./util";

export enum OverlayDatabaseMode {
  Overlay = "overlay",
  OverlayBase = "overlay-base",
  None = "none",
}

export const CODEQL_OVERLAY_MINIMUM_VERSION = "2.20.5";

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
const MAX_CACHE_OPERATION_MS = 120_000; // Two minutes

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
  const overlayDatabaseMode = config.augmentationProperties.overlayDatabaseMode;
  if (overlayDatabaseMode !== OverlayDatabaseMode.OverlayBase) {
    logger.debug(
      `Overlay database mode is ${overlayDatabaseMode}. ` +
        "Skip uploading overlay-base database to cache.",
    );
    return false;
  }
  if (!config.augmentationProperties.useOverlayDatabaseCaching) {
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

  const dbLocation = config.dbLocation;
  const codeQlVersion = (await codeql.getVersion()).version;
  const checkoutPath = getRequiredInput("checkout_path");
  const cacheKey = await generateCacheKey(config, codeQlVersion, checkoutPath);
  logger.info(
    `Uploading overlay-base database to Actions cache with key ${cacheKey}`,
  );

  try {
    const cacheId = await withTimeout(
      MAX_CACHE_OPERATION_MS,
      actionsCache.saveCache([dbLocation], cacheKey),
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

/**
 * Downloads the overlay-base database from the GitHub Actions cache. If conditions
 * for downloading are not met, the function does nothing and returns false.
 *
 * @param codeql The CodeQL instance
 * @param config The configuration object
 * @param logger The logger instance
 * @returns A promise that resolves to true if the download was performed and
 * successfully completed, or false otherwise
 */
export async function downloadOverlayBaseDatabaseFromCache(
  codeql: CodeQL,
  config: Config,
  logger: Logger,
): Promise<boolean> {
  const overlayDatabaseMode = config.augmentationProperties.overlayDatabaseMode;
  if (overlayDatabaseMode !== OverlayDatabaseMode.Overlay) {
    logger.debug(
      `Overlay database mode is ${overlayDatabaseMode}. ` +
        "Skip downloading overlay-base database from cache.",
    );
    return false;
  }
  if (!config.augmentationProperties.useOverlayDatabaseCaching) {
    logger.debug(
      "Overlay database caching is disabled. " +
        "Skip downloading overlay-base database from cache.",
    );
    return false;
  }
  if (isInTestMode()) {
    logger.debug(
      "In test mode. Skip downloading overlay-base database from cache.",
    );
    return false;
  }

  const dbLocation = config.dbLocation;
  const codeQlVersion = (await codeql.getVersion()).version;
  const restoreKey = getCacheRestoreKey(config, codeQlVersion);

  logger.info(
    `Looking in Actions cache for overlay-base database with restore key ${restoreKey}`,
  );

  try {
    const foundKey = await withTimeout(
      MAX_CACHE_OPERATION_MS,
      actionsCache.restoreCache([dbLocation], restoreKey),
      () => {
        logger.info("Timed out downloading overlay-base database from cache");
      },
    );

    if (foundKey === undefined) {
      logger.info("No overlay-base database found in Actions cache");
      return false;
    }

    logger.info(
      `Downloaded overlay-base database in cache with key ${foundKey}`,
    );
  } catch (error) {
    logger.warning(
      "Failed to download overlay-base database from cache: " +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }

  const databaseIsValid = checkOverlayBaseDatabase(
    config,
    logger,
    "Downloaded overlay-base database is invalid",
  );
  if (!databaseIsValid) {
    logger.warning("Downloaded overlay-base database failed validation");
    return false;
  }

  logger.info(`Successfully downloaded overlay-base database to ${dbLocation}`);
  return true;
}

async function generateCacheKey(
  config: Config,
  codeQlVersion: string,
  checkoutPath: string,
): Promise<string> {
  const sha = await getCommitOid(checkoutPath);
  return `${getCacheRestoreKey(config, codeQlVersion)}${sha}`;
}

function getCacheRestoreKey(config: Config, codeQlVersion: string): string {
  // The restore key (prefix) specifies which cached overlay-base databases are
  // compatible with the current analysis: the cached database must have the
  // same cache version and the same CodeQL bundle version.
  //
  // Actions cache supports using multiple restore keys to indicate preference.
  // Technically we prefer a cached overlay-base database with the same SHA as
  // we are analyzing. However, since overlay-base databases are built from the
  // default branch and used in PR analysis, it is exceedingly unlikely that
  // the commit SHA will ever be the same, so we can just leave it out.
  const languages = [...config.languages].sort().join("_");
  return `${CACHE_PREFIX}-${CACHE_VERSION}-${languages}-${codeQlVersion}-`;
}
