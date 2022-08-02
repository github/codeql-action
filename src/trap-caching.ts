import { Config } from "./config-utils";
import * as actionsUtil from "./actions-util";
import * as path from "path";
import * as fs from "fs";
import * as cache from "@actions/cache";
import { Logger } from "./logging";
import { Language } from "./languages";
import { CodeQL } from "./codeql";

export async function getTrapCachingExtractorConfigArgs(config: Config): Promise<string[]> {
  const result: string[] = [];
  for (const language of config.languages)
    result.push(...await getTrapCachingExtractorConfigArgsForLang(config, language));
  return result;
}

export async function getTrapCachingExtractorConfigArgsForLang(config: Config, language: Language): Promise<string[]> {
  const cache = config.trapCaches[language];
  if (cache === undefined)
    return [];
  const shouldWrite = await actionsUtil.isAnalyzingDefaultBranch();
  return [`-O="${language}.trap.cache.dir=${cache}"`, `-O="${language}.trap.cache.bound=1024"`, `-O="${language}.trap.cache.write=${shouldWrite}"`];
}

export async function downloadTrapCaches(
  codeql: CodeQL,
  languages: Language[],
  logger: Logger
): Promise<Partial<Record<Language, string>>> {
  const result = {};
  const languagesSupportingCaching = await getLanguagesSupportingCaching(codeql, languages)
  if (languagesSupportingCaching.length === 0)
    return result;
  
  const cachesDir = path.join(actionsUtil.getTemporaryDirectory(), "trapCaches");
  for (const language of languagesSupportingCaching) {
    const cacheDir = path.join(cachesDir, language);
    fs.mkdirSync(cacheDir, { recursive: true });
    result[language] = cacheDir;
  }

  if (await actionsUtil.isAnalyzingDefaultBranch()) {
    logger.debug("Analyzing default branch. Skipping downloading of TRAP caches.");
    return result;
  }

  for (const language of languages) {
    const cacheDir = result[language];
    if (cacheDir === undefined)
      continue;
    const found = await cache.restoreCache([cacheDir], cacheKey(language));
    if (found === undefined)
      result[language] = undefined; // Didn't find a cache, let's unset to avoid lookups in an empty dir
  }

  return result;
}

export async function uploadTrapCaches(
  config: Config,
  logger: Logger
): Promise<void> {
  if (!(await actionsUtil.isAnalyzingDefaultBranch())) {
    logger.debug("Not analyzing default branch. Skipping TRAP cache upload.");
    return;
  }

  for (const language of config.languages) {
    const cacheDir = config.trapCaches[language];
    if (cacheDir === undefined)
      continue;
    await cache.saveCache([cacheDir], cacheKey(language));
  }
}

async function getLanguagesSupportingCaching(codeql: CodeQL, languages: Language[]): Promise<Language[]> {
  const resolveResult = await codeql.betterResolveLanguages();
  const result: Language[] = [];
  for (const lang of languages) {
    const extractorOptions = resolveResult.extractors[lang][0]["extractor_options"]
    if (extractorOptions === undefined)
      continue;
    const trapOptions = extractorOptions["trap"]
    if (trapOptions === undefined)
      continue;
    const trapCacheOptions = trapOptions["cache"]
    if (trapCacheOptions === undefined)
      continue;
    if (trapCacheOptions.includes("dir") && trapCacheOptions.includes("bound") && trapCacheOptions.includes("write"))
      result.push(lang);
  }
  return result;
}

function cacheKey(language: Language): string {
  return `codeql-trap-cache-${language}`;
}
