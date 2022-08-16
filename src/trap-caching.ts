import * as fs from "fs";
import * as path from "path";

import * as cache from "@actions/cache";

import * as actionsUtil from "./actions-util";
import { CodeQL, CODEQL_VERSION_BETTER_RESOLVE_LANGUAGES } from "./codeql";
import { Config } from "./config-utils";
import { Language } from "./languages";
import { Logger } from "./logging";
import { codeQlVersionAbove } from "./util";

// This constant should be bumped if we make a breaking change
// to how the CodeQL Action stores or retrieves the TRAP cache,
// and will invalidate previous caches. We don't need to bump
// this for CLI/extractor changes, since the CLI version also
// goes into the cache key.
const CACHE_VERSION = 1;

// This constant sets the size of each TRAP cache in megabytes.
const CACHE_SIZE_MB = 1024;

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
    process.env.GITHUB_EVENT_NAME === "pull_request" &&
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
    const found = await cache.restoreCache([cacheDir], preferredKey, [
      await cachePrefix(codeql, language), // Fall back to any cache with the right key prefix
    ]);
    if (found === undefined) {
      // We didn't find a TRAP cache in the Actions cache, so the directory on disk is
      // still just an empty directory. There's no reason to tell the extractor to use it,
      // so let's unset the entry in the map so we don't set any extractor options.
      logger.info(`No TRAP cache found in Actions cache for ${language}`);
      result[language] = undefined;
    }
  }

  return result;
}

export async function uploadTrapCaches(
  codeql: CodeQL,
  config: Config,
  logger: Logger
): Promise<void> {
  if (!(await actionsUtil.isAnalyzingDefaultBranch())) return; // Only upload caches from the default branch

  const toAwait: Array<Promise<number>> = [];
  for (const language of config.languages) {
    const cacheDir = config.trapCaches[language];
    if (cacheDir === undefined) continue;
    const key = await cacheKey(
      codeql,
      language,
      process.env.GITHUB_SHA || "unknown"
    );
    logger.info(`Uploading TRAP cache to Actions cache with key ${key}`);
    toAwait.push(cache.saveCache([cacheDir], key));
  }
  await Promise.all(toAwait);
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
    if (resolveResult.extractors[lang].length !== 1) continue;
    const extractor = resolveResult.extractors[lang][0];
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
