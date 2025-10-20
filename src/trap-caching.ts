import * as fs from "fs";
import * as path from "path";

import * as actionsCache from "@actions/cache";

import * as actionsUtil from "./actions-util";
import * as apiClient from "./api-client";
import { type CodeQL } from "./codeql";
import { type Config } from "./config-utils";
import { DocUrl } from "./doc-url";
import { Feature, FeatureEnablement } from "./feature-flags";
import * as gitUtils from "./git-utils";
import { Language } from "./languages";
import { Logger } from "./logging";
import {
  asHTTPError,
  getErrorMessage,
  tryGetFolderBytes,
  waitForResultWithTimeLimit,
} from "./util";

// This constant should be bumped if we make a breaking change
// to how the CodeQL Action stores or retrieves the TRAP cache,
// and will invalidate previous caches. We don't need to bump
// this for CLI/extractor changes, since the CLI version also
// goes into the cache key.
const CACHE_VERSION = 1;

const CODEQL_TRAP_CACHE_PREFIX = "codeql-trap";

// This constant sets the minimum size in megabytes of a TRAP
// cache for us to consider it worth uploading.
const MINIMUM_CACHE_MB_TO_UPLOAD = 10;

// The maximum number of milliseconds to wait for TRAP cache
// uploads or downloads to complete before continuing. Note
// this timeout is per operation, so will be run as many
// times as there are languages with TRAP caching enabled.
const MAX_CACHE_OPERATION_MS = 120_000; // Two minutes

/**
 * Download TRAP caches from the Actions cache.
 * @param codeql The CodeQL instance to use.
 * @param languages The languages being analyzed.
 * @param logger A logger to record some informational messages to.
 * @returns A partial map from languages to TRAP cache paths on disk, with
 * languages for which we shouldn't use TRAP caching omitted.
 */
export async function downloadTrapCaches(
  codeql: CodeQL,
  languages: Language[],
  logger: Logger,
): Promise<{ [language: string]: string }> {
  const result: { [language: string]: string } = {};
  const languagesSupportingCaching = await getLanguagesSupportingCaching(
    codeql,
    languages,
    logger,
  );
  logger.info(
    `Found ${languagesSupportingCaching.length} languages that support TRAP caching`,
  );
  if (languagesSupportingCaching.length === 0) return result;

  const cachesDir = path.join(
    actionsUtil.getTemporaryDirectory(),
    "trapCaches",
  );
  for (const language of languagesSupportingCaching) {
    const cacheDir = path.join(cachesDir, language);
    fs.mkdirSync(cacheDir, { recursive: true });
    result[language] = cacheDir;
  }

  if (await gitUtils.isAnalyzingDefaultBranch()) {
    logger.info(
      "Analyzing default branch. Skipping downloading of TRAP caches.",
    );
    return result;
  }

  let baseSha = "unknown";
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (
    actionsUtil.getWorkflowEventName() === "pull_request" &&
    eventPath !== undefined
  ) {
    const event = JSON.parse(fs.readFileSync(path.resolve(eventPath), "utf-8"));
    baseSha = event.pull_request?.base?.sha || baseSha;
  }
  for (const language of languages) {
    const cacheDir = result[language];
    if (cacheDir === undefined) continue;
    // The SHA from the base of the PR is the most similar commit we might have a cache for
    const preferredKey = await cacheKey(codeql, language, baseSha);
    logger.info(
      `Looking in Actions cache for TRAP cache with key ${preferredKey}`,
    );
    const found = await waitForResultWithTimeLimit(
      MAX_CACHE_OPERATION_MS,
      actionsCache.restoreCache([cacheDir], preferredKey, [
        // Fall back to any cache with the right key prefix
        await cachePrefix(codeql, language),
      ]),
      () => {
        logger.info(
          `Timed out downloading cache for ${language}, will continue without it`,
        );
      },
    );
    if (found === undefined) {
      // We didn't find a TRAP cache in the Actions cache, so the directory on disk is
      // still just an empty directory. There's no reason to tell the extractor to use it,
      // so let's unset the entry in the map so we don't set any extractor options.
      logger.info(`No TRAP cache found in Actions cache for ${language}`);
      delete result[language];
    }
  }

  return result;
}

/**
 * Possibly upload TRAP caches to the Actions cache.
 * @param codeql The CodeQL instance to use.
 * @param config The configuration for this workflow.
 * @param logger A logger to record some informational messages to.
 * @returns Whether the TRAP caches were uploaded.
 */
export async function uploadTrapCaches(
  codeql: CodeQL,
  config: Config,
  logger: Logger,
): Promise<boolean> {
  if (!(await gitUtils.isAnalyzingDefaultBranch())) return false; // Only upload caches from the default branch

  for (const language of config.languages) {
    const cacheDir = config.trapCaches[language];
    if (cacheDir === undefined) continue;
    const trapFolderSize = await tryGetFolderBytes(cacheDir, logger);
    if (trapFolderSize === undefined) {
      logger.info(
        `Skipping upload of TRAP cache for ${language} as we couldn't determine its size`,
      );
      continue;
    }
    if (trapFolderSize < MINIMUM_CACHE_MB_TO_UPLOAD * 1_048_576) {
      logger.info(
        `Skipping upload of TRAP cache for ${language} as it is too small`,
      );
      continue;
    }
    const key = await cacheKey(
      codeql,
      language,
      process.env.GITHUB_SHA || "unknown",
    );
    logger.info(`Uploading TRAP cache to Actions cache with key ${key}`);
    await waitForResultWithTimeLimit(
      MAX_CACHE_OPERATION_MS,
      actionsCache.saveCache([cacheDir], key),
      () => {
        logger.info(
          `Timed out waiting for TRAP cache for ${language} to upload, will continue without uploading`,
        );
      },
    );
  }
  return true;
}

export interface TrapCacheCleanupStatusReport {
  trap_cache_cleanup_error?: string;
  trap_cache_cleanup_size_bytes?: number;
  trap_cache_cleanup_skipped_because?: string;
}

export async function cleanupTrapCaches(
  config: Config,
  features: FeatureEnablement,
  logger: Logger,
): Promise<TrapCacheCleanupStatusReport> {
  if (!(await features.getValue(Feature.CleanupTrapCaches))) {
    return {
      trap_cache_cleanup_skipped_because: "feature disabled",
    };
  }
  if (!(await gitUtils.isAnalyzingDefaultBranch())) {
    return {
      trap_cache_cleanup_skipped_because: "not analyzing default branch",
    };
  }

  try {
    let totalBytesCleanedUp = 0;

    const allCaches = await apiClient.listActionsCaches(
      CODEQL_TRAP_CACHE_PREFIX,
      await gitUtils.getRef(),
    );

    for (const language of config.languages) {
      if (config.trapCaches[language]) {
        const cachesToRemove = await getTrapCachesForLanguage(
          allCaches,
          language,
          logger,
        );
        // Dates returned by the API are in ISO 8601 format, so we can sort them lexicographically
        cachesToRemove.sort((a, b) => a.created_at.localeCompare(b.created_at));
        // Keep the most recent cache
        const mostRecentCache = cachesToRemove.pop();
        logger.debug(
          `Keeping most recent TRAP cache (${JSON.stringify(mostRecentCache)})`,
        );

        if (cachesToRemove.length === 0) {
          logger.info(`No TRAP caches to clean up for ${language}.`);
          continue;
        }

        for (const cache of cachesToRemove) {
          logger.debug(`Cleaning up TRAP cache (${JSON.stringify(cache)})`);
          await apiClient.deleteActionsCache(cache.id);
        }
        const bytesCleanedUp = cachesToRemove.reduce(
          (acc, item) => acc + item.size_in_bytes,
          0,
        );
        totalBytesCleanedUp += bytesCleanedUp;
        const megabytesCleanedUp = (bytesCleanedUp / (1024 * 1024)).toFixed(2);
        logger.info(
          `Cleaned up ${megabytesCleanedUp} MiB of old TRAP caches for ${language}.`,
        );
      }
    }
    return { trap_cache_cleanup_size_bytes: totalBytesCleanedUp };
  } catch (e) {
    if (asHTTPError(e)?.status === 403) {
      logger.warning(
        "Could not cleanup TRAP caches as the token did not have the required permissions. " +
          'To clean up TRAP caches, ensure the token has the "actions:write" permission. ' +
          `See ${DocUrl.ASSIGNING_PERMISSIONS_TO_JOBS} for more information.`,
      );
    } else {
      logger.info(`Failed to cleanup TRAP caches, continuing. Details: ${e}`);
    }
    return { trap_cache_cleanup_error: getErrorMessage(e) };
  }
}

async function getTrapCachesForLanguage(
  allCaches: apiClient.ActionsCacheItem[],
  language: Language,
  logger: Logger,
): Promise<Array<Required<apiClient.ActionsCacheItem>>> {
  logger.debug(`Listing TRAP caches for ${language}`);

  for (const cache of allCaches) {
    if (!cache.created_at || !cache.id || !cache.key || !cache.size_in_bytes) {
      throw new Error(
        "An unexpected cache item was returned from the API that was missing one or " +
          `more required fields: ${JSON.stringify(cache)}`,
      );
    }
  }

  return allCaches.filter((cache) => {
    return cache.key?.includes(`-${language}-`);
  }) as Array<Required<apiClient.ActionsCacheItem>>;
}

export async function getLanguagesSupportingCaching(
  codeql: CodeQL,
  languages: Language[],
  logger: Logger,
): Promise<Language[]> {
  const result: Language[] = [];
  const resolveResult = await codeql.betterResolveLanguages();
  outer: for (const lang of languages) {
    const extractorsForLanguage = resolveResult.extractors[lang];
    if (extractorsForLanguage === undefined) {
      logger.info(
        `${lang} does not support TRAP caching (couldn't find an extractor)`,
      );
      continue;
    }
    if (extractorsForLanguage.length !== 1) {
      logger.info(
        `${lang} does not support TRAP caching (found multiple extractors)`,
      );
      continue;
    }
    const extractor = extractorsForLanguage[0];
    const trapCacheOptions =
      extractor.extractor_options?.trap?.properties?.cache?.properties;
    if (trapCacheOptions === undefined) {
      logger.info(
        `${lang} does not support TRAP caching (missing option group)`,
      );
      continue;
    }
    for (const requiredOpt of ["dir", "bound", "write"]) {
      if (!(requiredOpt in trapCacheOptions)) {
        logger.info(
          `${lang} does not support TRAP caching (missing ${requiredOpt} option)`,
        );
        continue outer;
      }
    }
    result.push(lang);
  }
  return result;
}

async function cacheKey(
  codeql: CodeQL,
  language: Language,
  baseSha: string,
): Promise<string> {
  return `${await cachePrefix(codeql, language)}${baseSha}`;
}

async function cachePrefix(
  codeql: CodeQL,
  language: Language,
): Promise<string> {
  return `${CODEQL_TRAP_CACHE_PREFIX}-${CACHE_VERSION}-${
    (await codeql.getVersion()).version
  }-${language}-`;
}
