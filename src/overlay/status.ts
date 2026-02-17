/*
 * We perform enablement checks for overlay analysis to avoid using it on runners that are too small
 * to support it. However these checks cannot avoid every potential issue without being overly
 * conservative. Therefore, if our enablement checks enable overlay analysis for a runner that is
 * too small, we want to remember that, so that we will not try to use overlay analysis until
 * something changes (e.g. a larger runner is provisioned, or a new CodeQL version is released).
 *
 * We use the Actions cache as a lightweight way of providing this functionality.
 */

import * as fs from "fs";
import * as path from "path";

import * as actionsCache from "@actions/cache";

import { getTemporaryDirectory } from "../actions-util";
import { type CodeQL } from "../codeql";
import { Logger } from "../logging";
import {
  DiskUsage,
  getErrorMessage,
  waitForResultWithTimeLimit,
} from "../util";

/** The maximum time to wait for a cache operation to complete. */
const MAX_CACHE_OPERATION_MS = 30_000;

/** File name for the serialized overlay status. */
const STATUS_FILE_NAME = "overlay-status.json";

/** Status of an overlay analysis for a set of languages. */
export interface OverlayStatus {
  /** Whether the job attempted to build an overlay base database. */
  attemptedToBuildOverlayBaseDatabase: boolean;
  /** Whether the job successfully built an overlay base database. */
  builtOverlayBaseDatabase: boolean;
}

/**
 * Whether overlay analysis should be skipped, based on the cached status for the given languages and disk usage.
 */
export async function shouldSkipOverlayAnalysis(
  codeql: CodeQL,
  languages: string[],
  diskUsage: DiskUsage,
  logger: Logger,
): Promise<boolean> {
  const status = await getOverlayStatus(codeql, languages, diskUsage, logger);
  if (status === undefined) {
    logger.debug("No cached overlay status found.");
    return false;
  }
  if (
    status.attemptedToBuildOverlayBaseDatabase &&
    !status.builtOverlayBaseDatabase
  ) {
    logger.debug(
      "Cached overlay status indicates that building an overlay base database was unsuccessful.",
    );
    return true;
  }
  logger.debug(
    "Cached overlay status does not indicate a previous unsuccessful attempt to build an overlay base database.",
  );
  return false;
}

/**
 * Retrieve overlay status from the Actions cache, if available.
 *
 * @returns `undefined` if no status was found in the cache (e.g. first run with
 * this cache key) or if the cache operation fails.
 */
export async function getOverlayStatus(
  codeql: CodeQL,
  languages: string[],
  diskUsage: DiskUsage,
  logger: Logger,
): Promise<OverlayStatus | undefined> {
  const cacheKey = await getCacheKey(codeql, languages, diskUsage);
  const statusFile = path.join(
    getTemporaryDirectory(),
    "overlay-status",
    [...languages].sort().join("+"),
    STATUS_FILE_NAME,
  );
  await fs.promises.mkdir(path.dirname(statusFile), { recursive: true });

  try {
    const foundKey = await waitForResultWithTimeLimit(
      MAX_CACHE_OPERATION_MS,
      actionsCache.restoreCache([statusFile], cacheKey),
      () => {
        logger.info("Timed out restoring overlay status from cache.");
      },
    );
    if (foundKey === undefined) {
      logger.debug("No overlay status found in Actions cache.");
      return undefined;
    }

    if (!fs.existsSync(statusFile)) {
      logger.debug(
        "Overlay status cache entry found but status file is missing.",
      );
      return undefined;
    }

    const contents = await fs.promises.readFile(statusFile, "utf-8");
    return JSON.parse(contents) as OverlayStatus;
  } catch (error) {
    logger.warning(
      `Failed to restore overlay status from cache: ${getErrorMessage(error)}`,
    );
    return undefined;
  }
}

/**
 * Save overlay status to the Actions cache.
 *
 * @returns `true` if the status was saved successfully, `false` otherwise.
 */
export async function saveOverlayStatus(
  codeql: CodeQL,
  languages: string[],
  diskUsage: DiskUsage,
  status: OverlayStatus,
  logger: Logger,
): Promise<boolean> {
  const cacheKey = await getCacheKey(codeql, languages, diskUsage);
  const statusFile = path.join(
    getTemporaryDirectory(),
    "overlay-status",
    [...languages].sort().join("+"),
    STATUS_FILE_NAME,
  );
  await fs.promises.mkdir(path.dirname(statusFile), { recursive: true });
  await fs.promises.writeFile(statusFile, JSON.stringify(status));

  try {
    const cacheId = await waitForResultWithTimeLimit(
      MAX_CACHE_OPERATION_MS,
      actionsCache.saveCache([statusFile], cacheKey),
      () => {},
    );
    if (cacheId === undefined) {
      logger.warning("Timed out saving overlay status to cache.");
      return false;
    }
    logger.info(`Saved overlay status to Actions cache with key ${cacheKey}`);
    return true;
  } catch (error) {
    logger.warning(
      `Failed to save overlay status to cache: ${getErrorMessage(error)}`,
    );
    return false;
  }
}

export async function getCacheKey(
  codeql: CodeQL,
  languages: string[],
  diskUsage: DiskUsage,
): Promise<string> {
  // Total disk space, rounded to the nearest 10 GB. This is included in the cache key so that if a
  // customer upgrades their runner, we will try again to use overlay analysis, even if the CodeQL
  // version has not changed. We round to the nearest 10 GB to work around small differences in disk
  // space.
  //
  // Limitation: this can still flip from "too small" to "large enough" and back again if the disk
  // space fluctuates above and below a multiple of 10 GB.
  const diskSpaceToNearest10Gb = `${10 * Math.floor(diskUsage.numTotalBytes / (10 * 1024 * 1024 * 1024))}GB`;

  // Include the CodeQL version in the cache key so we will try again to use overlay analysis when
  // new queries and libraries that may be more efficient are released.
  return `codeql-overlay-status-${[...languages].sort().join("+")}-${(await codeql.getVersion()).version}-runner-${diskSpaceToNearest10Gb}`;
}
