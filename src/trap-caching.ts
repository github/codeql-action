import * as fs from "fs";
import * as path from "path";

import * as cache from "@actions/cache";

import * as actionsUtil from "./actions-util";
import { CodeQL, CODEQL_VERSION_BETTER_RESOLVE_LANGUAGES } from "./codeql";
import { Config } from "./config-utils";
import { Language } from "./languages";
import { Logger } from "./logging";
import { codeQlVersionAbove, tryGetFolderBytes, withTimeout } from "./util";

// This constant should be bumped if we make a breaking change
// to how the CodeQL Action stores or retrieves the TRAP cache,
// and will invalidate previous caches. We don't need to bump
// this for CLI/extractor changes, since the CLI version also
// goes into the cache key.
const CACHE_VERSION = 1;

// This constant sets the size of each TRAP cache in megabytes.
const CACHE_SIZE_MB = 1024;

// This constant sets the minimum size in megabytes of a TRAP
// cache for us to consider it worth uploading.
const MINIMUM_CACHE_MB_TO_UPLOAD = 10;

// The maximum number of milliseconds to wait for TRAP cache
// uploads or downloads to complete before continuing. Note
// this timeout is per operation, so will be run as many
// times as there are languages with TRAP caching enabled.
const MAX_CACHE_OPERATION_MS = 120_000; // Two minutes

export async function getTrapCachingExtractorConfigArgs(
  config: Config
): Promise<string[]> {
  const result: string[][] = [];
  for (const language of config.languages)
    result.push(
      await getTrapCachingExtractorConfigArgsForLang(config, language)
    );
  return result.flat();
}

export async function getTrapCachingExtractorConfigArgsForLang(
  config: Config,
  language: Language
): Promise<string[]> {
  const cacheDir = config.trapCaches[language];
  if (cacheDir === undefined) return [];
  const write = await actionsUtil.isAnalyzingDefaultBranch();
  return [
    `-O=${language}.trap.cache.dir=${cacheDir}`,
    `-O=${language}.trap.cache.bound=${CACHE_SIZE_MB}`,
    `-O=${language}.trap.cache.write=${write}`,
  ];
}

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
  logger: Logger
): Promise<Partial<Record<Language, string>>> {
  const result = {};
  const languagesSupportingCaching = await getLanguagesSupportingCaching(
    codeql,
    languages,
    logger
  );
  logger.info(
    `Found ${languagesSupportingCaching.length} languages that support TRAP caching`
  );
  if (languagesSupportingCaching.length === 0) return result;

  const cachesDir = path.join(
    actionsUtil.getTemporaryDirectory(),
    "trapCaches"
  );
  for (const language of languagesSupportingCaching) {
    const cacheDir = path.join(cachesDir, language);
    fs.mkdirSync(cacheDir, { recursive: true });
    result[language] = cacheDir;
  }

  if (await actionsUtil.isAnalyzingDefaultBranch()) {
    logger.info(
      "Analyzing default branch. Skipping downloading of TRAP caches."
    );
    return result;
  }

  let baseSha = "unknown";
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (
    actionsUtil.workflowEventName() === "pull_request" &&
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
      `Looking in Actions cache for TRAP cache with key ${preferredKey}`
    );
    const found = await withTimeout(
      MAX_CACHE_OPERATION_MS,
      cache.restoreCache([cacheDir], preferredKey, [
        // Fall back to any cache with the right key prefix
        await cachePrefix(codeql, language),
      ]),
      () => {
        logger.info(
          `Timed out downloading cache for ${language}, will continue without it`
        );
      }
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
  logger: Logger
): Promise<boolean> {
  if (!(await actionsUtil.isAnalyzingDefaultBranch())) return false; // Only upload caches from the default branch

  for (const language of config.languages) {
    const cacheDir = config.trapCaches[language];
    if (cacheDir === undefined) continue;
    const trapFolderSize = await tryGetFolderBytes(cacheDir, logger);
    if (trapFolderSize === undefined) {
      logger.info(
        `Skipping upload of TRAP cache for ${language} as we couldn't determine its size`
      );
      continue;
    }
    if (trapFolderSize < MINIMUM_CACHE_MB_TO_UPLOAD * 1_048_576) {
      logger.info(
        `Skipping upload of TRAP cache for ${language} as it is too small`
      );
      continue;
    }
    const key = await cacheKey(
      codeql,
      language,
      process.env.GITHUB_SHA || "unknown"
    );
    logger.info(`Uploading TRAP cache to Actions cache with key ${key}`);
    await withTimeout(
      MAX_CACHE_OPERATION_MS,
      cache.saveCache([cacheDir], key),
      () => {
        logger.info(
          `Timed out waiting for TRAP cache for ${language} to upload, will continue without uploading`
        );
      }
    );
  }
  return true;
}

export async function getLanguagesSupportingCaching(
  codeql: CodeQL,
  languages: Language[],
  logger: Logger
): Promise<Language[]> {
  const result: Language[] = [];
  if (
    !(await codeQlVersionAbove(codeql, CODEQL_VERSION_BETTER_RESOLVE_LANGUAGES))
  )
    return result;
  const resolveResult = await codeql.betterResolveLanguages();
  outer: for (const lang of languages) {
    const extractorsForLanguage = resolveResult.extractors[lang];
    if (extractorsForLanguage === undefined) {
      logger.info(
        `${lang} does not support TRAP caching (couldn't find an extractor)`
      );
      continue;
    }
    if (extractorsForLanguage.length !== 1) {
      logger.info(
        `${lang} does not support TRAP caching (found multiple extractors)`
      );
      continue;
    }
    const extractor = extractorsForLanguage[0];
    const trapCacheOptions =
      extractor.extractor_options?.trap?.properties?.cache?.properties;
    if (trapCacheOptions === undefined) {
      logger.info(
        `${lang} does not support TRAP caching (missing option group)`
      );
      continue;
    }
    for (const requiredOpt of ["dir", "bound", "write"]) {
      if (!(requiredOpt in trapCacheOptions)) {
        logger.info(
          `${lang} does not support TRAP caching (missing ${requiredOpt} option)`
        );
        continue outer;
      }
    }
    result.push(lang);
  }
  return result;
}

export async function getTotalCacheSize(
  trapCaches: Partial<Record<Language, string>>,
  logger: Logger
): Promise<number> {
  const sizes = await Promise.all(
    Object.values(trapCaches).map((cacheDir) =>
      tryGetFolderBytes(cacheDir, logger)
    )
  );
  return sizes.map((a) => a || 0).reduce((a, b) => a + b, 0);
}

async function cacheKey(
  codeql: CodeQL,
  language: Language,
  baseSha: string
): Promise<string> {
  return `${await cachePrefix(codeql, language)}${baseSha}`;
}

async function cachePrefix(
  codeql: CodeQL,
  language: Language
): Promise<string> {
  return `codeql-trap-${CACHE_VERSION}-${await codeql.getVersion()}-${language}-`;
}
