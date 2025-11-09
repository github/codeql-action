import * as os from "os";
import { join } from "path";

import * as actionsCache from "@actions/cache";
import * as glob from "@actions/glob";

import { getTemporaryDirectory } from "./actions-util";
import { listActionsCaches } from "./api-client";
import { createCacheKeyHash, getTotalCacheSize } from "./caching-utils";
import { CodeQL } from "./codeql";
import { Config } from "./config-utils";
import { EnvVar } from "./environment";
import { Feature, FeatureEnablement, Features } from "./feature-flags";
import { KnownLanguage, Language } from "./languages";
import { Logger } from "./logging";
import { getErrorMessage, getRequiredEnvParam } from "./util";

/**
 * Caching configuration for a particular language.
 */
export interface CacheConfig {
  /** Gets the paths of directories on the runner that should be included in the cache. */
  getDependencyPaths: () => string[];
  /**
   * Gets an array of glob patterns for the paths of files whose contents affect which dependencies are used
   * by a project. This function also checks whether there are any matching files and returns
   * `undefined` if no files match.
   *
   * The glob patterns are intended to be used for cache keys, where we find all files which match these
   * patterns, calculate a hash for their contents, and use that hash as part of the cache key.
   */
  getHashPatterns: (
    codeql: CodeQL,
    features: FeatureEnablement,
  ) => Promise<string[] | undefined>;
}

const CODEQL_DEPENDENCY_CACHE_PREFIX = "codeql-dependencies";
const CODEQL_DEPENDENCY_CACHE_VERSION = 1;

/**
 * Returns a path to a directory intended to be used to store .jar files
 * for the Java `build-mode: none` extractor.
 * @returns The path to the directory that should be used by the `build-mode: none` extractor.
 */
export function getJavaTempDependencyDir(): string {
  return join(getTemporaryDirectory(), "codeql_java", "repository");
}

/**
 * Returns an array of paths of directories on the runner that should be included in a dependency cache
 * for a Java analysis. It is important that this is a function, because we call `getTemporaryDirectory`
 * which would otherwise fail in tests if we haven't had a chance to initialise `RUNNER_TEMP`.
 *
 * @returns The paths of directories on the runner that should be included in a dependency cache
 * for a Java analysis.
 */
export function getJavaDependencyDirs(): string[] {
  return [
    // Maven
    join(os.homedir(), ".m2", "repository"),
    // Gradle
    join(os.homedir(), ".gradle", "caches"),
    // CodeQL Java build-mode: none
    getJavaTempDependencyDir(),
  ];
}

/**
 * Checks that there are files which match `patterns`. If there are matching files for any of the patterns,
 * this function returns all `patterns`. Otherwise, `undefined` is returned.
 *
 * @param patterns The glob patterns to find matching files for.
 * @returns The array of glob patterns if there are matching files, or `undefined` otherwise.
 */
export async function makePatternCheck(
  patterns: string[],
): Promise<string[] | undefined> {
  const globber = await makeGlobber(patterns);

  if ((await globber.glob()).length === 0) {
    return undefined;
  }

  return patterns;
}

/** These files contain accurate information about dependencies, including the exact versions
 * that the relevant package manager has determined for the project. Using these gives us
 * stable hashes unless the dependencies change.
 */
export const CSHARP_BASE_PATTERNS = [
  // NuGet
  "**/packages.lock.json",
  // Paket
  "**/paket.lock",
];

/** These are less accurate for use in cache key calculations, because they:
 *
 * - Don't contain the exact versions used. They may only contain version ranges or none at all.
 * - They contain information unrelated to dependencies, which we don't care about.
 *
 * As a result, the hash we compute from these files may change, even if
 * the dependencies haven't changed.
 */
export const CSHARP_EXTRA_PATTERNS = [
  "**/*.csproj",
  "**/packages.config",
  "**/nuget.config",
];

/**
 * Returns the list of glob patterns that should be used to calculate the cache key hash
 * for a C# dependency cache. This will try to use `CSHARP_BASE_PATTERNS` whenever possible.
 * As a fallback, it will also use `CSHARP_EXTRA_PATTERNS` if the corresponding FF is enabled.
 *
 * @param codeql The CodeQL instance to use.
 * @param features Information about which FFs are enabled.
 * @returns A list of glob patterns to use for hashing.
 */
export async function getCsharpHashPatterns(
  codeql: CodeQL,
  features: FeatureEnablement,
): Promise<string[] | undefined> {
  const basePatterns = await internal.makePatternCheck(CSHARP_BASE_PATTERNS);

  if (basePatterns !== undefined) {
    return basePatterns;
  }

  if (await features.getValue(Feature.CsharpNewCacheKey, codeql)) {
    return internal.makePatternCheck(CSHARP_EXTRA_PATTERNS);
  }

  // If we get to this point, we didn't find any files with `CSHARP_BASE_PATTERNS`,
  // and `Feature.CsharpNewCacheKey` is not enabled.
  return undefined;
}

/**
 * Default caching configurations per language.
 */
const defaultCacheConfigs: { [language: string]: CacheConfig } = {
  java: {
    getDependencyPaths: getJavaDependencyDirs,
    getHashPatterns: async () =>
      internal.makePatternCheck([
        // Maven
        "**/pom.xml",
        // Gradle
        "**/*.gradle*",
        "**/gradle-wrapper.properties",
        "buildSrc/**/Versions.kt",
        "buildSrc/**/Dependencies.kt",
        "gradle/*.versions.toml",
        "**/versions.properties",
      ]),
  },
  csharp: {
    getDependencyPaths: () => [join(os.homedir(), ".nuget", "packages")],
    getHashPatterns: getCsharpHashPatterns,
  },
  go: {
    getDependencyPaths: () => [join(os.homedir(), "go", "pkg", "mod")],
    getHashPatterns: async () => internal.makePatternCheck(["**/go.sum"]),
  },
};

async function makeGlobber(patterns: string[]): Promise<glob.Globber> {
  return glob.create(patterns.join("\n"));
}

/** Enumerates possible outcomes for cache hits. */
export enum CacheHitKind {
  /** We were unable to calculate a hash for the key. */
  NoHash = "no-hash",
  /** No cache was found. */
  Miss = "miss",
  /** The primary cache key matched. */
  Exact = "exact",
  /** A restore key matched. */
  Partial = "partial",
}

/** Represents results of trying to restore a dependency cache for a language. */
export interface DependencyCacheRestoreStatus {
  language: Language;
  hit_kind: CacheHitKind;
  download_duration_ms?: number;
}

/** An array of `DependencyCacheRestoreStatus` objects for each analysed language with a caching configuration. */
export type DependencyCacheRestoreStatusReport = DependencyCacheRestoreStatus[];

/**
 * A wrapper around `cacheConfig.getHashPatterns` which logs when there are no files to calculate
 * a hash for the cache key from.
 *
 * @param codeql The CodeQL instance to use.
 * @param features Information about which FFs are enabled.
 * @param language The language the `CacheConfig` is for. For use in the log message.
 * @param cacheConfig The caching configuration to call `getHashPatterns` on.
 * @param logger The logger to write the log message to if there is an error.
 * @returns An array of glob patterns to use for hashing files, or `undefined` if there are no matching files.
 */
export async function checkHashPatterns(
  codeql: CodeQL,
  features: FeatureEnablement,
  language: Language,
  cacheConfig: CacheConfig,
  logger: Logger,
): Promise<string[] | undefined> {
  const patterns = await cacheConfig.getHashPatterns(codeql, features);

  if (patterns === undefined) {
    logger.info(
      `Skipping download of dependency cache for ${language} as we cannot calculate a hash for the cache key.`,
    );
  }

  return patterns;
}

/**
 * Attempts to restore dependency caches for the languages being analyzed.
 *
 * @param codeql The CodeQL instance to use.
 * @param features Information about which FFs are enabled.
 * @param languages The languages being analyzed.
 * @param logger A logger to record some informational messages to.
 *
 * @returns An array of `DependencyCacheRestoreStatus` objects for each analysed language with a caching configuration.
 */
export async function downloadDependencyCaches(
  codeql: CodeQL,
  features: Features,
  languages: Language[],
  logger: Logger,
): Promise<DependencyCacheRestoreStatusReport> {
  const status: DependencyCacheRestoreStatusReport = [];

  for (const language of languages) {
    const cacheConfig = defaultCacheConfigs[language];

    if (cacheConfig === undefined) {
      logger.info(
        `Skipping download of dependency cache for ${language} as we have no caching configuration for it.`,
      );
      continue;
    }

    // Check that we can find files to calculate the hash for the cache key from, so we don't end up
    // with an empty string.
    const patterns = await checkHashPatterns(
      codeql,
      features,
      language,
      cacheConfig,
      logger,
    );
    if (patterns === undefined) {
      status.push({ language, hit_kind: CacheHitKind.NoHash });
      continue;
    }

    const primaryKey = await cacheKey(codeql, features, language, patterns);
    const restoreKeys: string[] = [
      await cachePrefix(codeql, features, language),
    ];

    logger.info(
      `Downloading cache for ${language} with key ${primaryKey} and restore keys ${restoreKeys.join(
        ", ",
      )}`,
    );

    const start = performance.now();
    const hitKey = await actionsCache.restoreCache(
      cacheConfig.getDependencyPaths(),
      primaryKey,
      restoreKeys,
    );
    const download_duration_ms = Math.round(performance.now() - start);

    if (hitKey !== undefined) {
      logger.info(`Cache hit on key ${hitKey} for ${language}.`);
      const hit_kind =
        hitKey === primaryKey ? CacheHitKind.Exact : CacheHitKind.Partial;
      status.push({ language, hit_kind, download_duration_ms });
    } else {
      status.push({ language, hit_kind: CacheHitKind.Miss });
      logger.info(`No suitable cache found for ${language}.`);
    }
  }

  return status;
}

/** Enumerates possible outcomes for storing caches. */
export enum CacheStoreResult {
  /** We were unable to calculate a hash for the key. */
  NoHash = "no-hash",
  /** There is nothing to store in the cache. */
  Empty = "empty",
  /** There already exists a cache with the key we are trying to store. */
  Duplicate = "duplicate",
  /** The cache was stored successfully. */
  Stored = "stored",
}

/** Represents results of trying to upload a dependency cache for a language. */
export interface DependencyCacheUploadStatus {
  language: Language;
  result: CacheStoreResult;
  upload_size_bytes?: number;
  upload_duration_ms?: number;
}

/** An array of `DependencyCacheUploadStatus` objects for each analysed language with a caching configuration. */
export type DependencyCacheUploadStatusReport = DependencyCacheUploadStatus[];

/**
 * Attempts to store caches for the languages that were analyzed.
 *
 * @param codeql The CodeQL instance to use.
 * @param features Information about which FFs are enabled.
 * @param config The configuration for this workflow.
 * @param logger A logger to record some informational messages to.
 *
 * @returns An array of `DependencyCacheUploadStatus` objects for each analysed language with a caching configuration.
 */
export async function uploadDependencyCaches(
  codeql: CodeQL,
  features: Features,
  config: Config,
  logger: Logger,
): Promise<DependencyCacheUploadStatusReport> {
  const status: DependencyCacheUploadStatusReport = [];
  for (const language of config.languages) {
    const cacheConfig = defaultCacheConfigs[language];

    if (cacheConfig === undefined) {
      logger.info(
        `Skipping upload of dependency cache for ${language} as we have no caching configuration for it.`,
      );
      continue;
    }

    // Check that we can find files to calculate the hash for the cache key from, so we don't end up
    // with an empty string.
    const patterns = await checkHashPatterns(
      codeql,
      features,
      language,
      cacheConfig,
      logger,
    );
    if (patterns === undefined) {
      continue;
    }

    // Calculate the size of the files that we would store in the cache. We use this to determine whether the
    // cache should be saved or not. For example, if there are no files to store, then we skip creating the
    // cache. In the future, we could also:
    // - Skip uploading caches with a size below some threshold: this makes sense for avoiding the overhead
    //   of storing and restoring small caches, but does not help with alert wobble if a package repository
    //   cannot be reached in a given run.
    // - Skip uploading caches with a size above some threshold: this could be a concern if other workflows
    //   use the cache quota that we compete with. In that case, we do not wish to use up all of the quota
    //   with the dependency caches. For this, we could use the Cache API to check whether other workflows
    //   are using the quota and how full it is.
    const size = await getTotalCacheSize(
      cacheConfig.getDependencyPaths(),
      logger,
      true,
    );

    // Skip uploading an empty cache.
    if (size === 0) {
      status.push({ language, result: CacheStoreResult.Empty });
      logger.info(
        `Skipping upload of dependency cache for ${language} since it is empty.`,
      );
      continue;
    }

    const key = await cacheKey(codeql, features, language, patterns);

    logger.info(
      `Uploading cache of size ${size} for ${language} with key ${key}...`,
    );

    try {
      const start = performance.now();
      await actionsCache.saveCache(cacheConfig.getDependencyPaths(), key);
      const upload_duration_ms = Math.round(performance.now() - start);

      status.push({
        language,
        result: CacheStoreResult.Stored,
        upload_size_bytes: Math.round(size),
        upload_duration_ms,
      });
    } catch (error) {
      // `ReserveCacheError` indicates that the cache key is already in use, which means that a
      // cache with that key already exists or is in the process of being uploaded by another
      // workflow. We can ignore this.
      if (error instanceof actionsCache.ReserveCacheError) {
        logger.info(
          `Not uploading cache for ${language}, because ${key} is already in use.`,
        );
        logger.debug(error.message);

        status.push({ language, result: CacheStoreResult.Duplicate });
      } else {
        // Propagate other errors upwards.
        throw error;
      }
    }
  }

  return status;
}

/**
 * Computes a cache key for the specified language.
 *
 * @param codeql The CodeQL instance to use.
 * @param features Information about which FFs are enabled.
 * @param language The language being analyzed.
 * @param patterns The file patterns to hash.
 *
 * @returns A cache key capturing information about the project(s) being analyzed in the specified language.
 */
async function cacheKey(
  codeql: CodeQL,
  features: Features,
  language: Language,
  patterns: string[],
): Promise<string> {
  const hash = await glob.hashFiles(patterns.join("\n"));
  return `${await cachePrefix(codeql, features, language)}${hash}`;
}

/**
 * If experimental features which the cache contents depend on are enabled for the current language,
 * this function returns a prefix that uniquely identifies the set of enabled features. The purpose of
 * this is to avoid restoring caches whose contents depended on experimental features, if those
 * experimental features are later disabled.
 *
 * @param codeql The CodeQL instance.
 * @param features Information about enabled features.
 * @param language The language we are creating the key for.
 *
 * @returns A cache key prefix identifying the enabled, experimental features that the cache depends on.
 */
export async function getFeaturePrefix(
  codeql: CodeQL,
  features: FeatureEnablement,
  language: Language,
): Promise<string> {
  const enabledFeatures: Feature[] = [];

  const addFeatureIfEnabled = async (feature: Feature) => {
    if (await features.getValue(feature, codeql)) {
      enabledFeatures.push(feature);
    }
  };

  if (language === KnownLanguage.java) {
    // To ensure a safe rollout of JAR minimization, we change the key when the feature is enabled.
    const minimizeJavaJars = await features.getValue(
      Feature.JavaMinimizeDependencyJars,
      codeql,
    );

    // To maintain backwards compatibility with this, we return "minify-" instead of a hash.
    if (minimizeJavaJars) {
      return "minify-";
    }
  } else if (language === KnownLanguage.csharp) {
    await addFeatureIfEnabled(Feature.CsharpNewCacheKey);
  }

  // If any features that affect the cache are enabled, return a feature prefix by
  // computing a hash of the feature array.
  if (enabledFeatures.length > 0) {
    return `${createCacheKeyHash(enabledFeatures)}-`;
  }

  // No feature prefix.
  return "";
}

/**
 * Constructs a prefix for the cache key, comprised of a CodeQL-specific prefix, a version number that
 * can be changed to invalidate old caches, the runner's operating system, and the specified language name.
 *
 * @param codeql The CodeQL instance to use.
 * @param features Information about which FFs are enabled.
 * @param language The language being analyzed.
 * @returns The prefix that identifies what a cache is for.
 */
async function cachePrefix(
  codeql: CodeQL,
  features: Features,
  language: Language,
): Promise<string> {
  const runnerOs = getRequiredEnvParam("RUNNER_OS");
  const customPrefix = process.env[EnvVar.DEPENDENCY_CACHING_PREFIX];
  let prefix = CODEQL_DEPENDENCY_CACHE_PREFIX;

  if (customPrefix !== undefined && customPrefix.length > 0) {
    prefix = `${prefix}-${customPrefix}`;
  }

  // Calculate the feature prefix for the cache, if any. This is a hash that identifies
  // experimental features that affect the cache contents.
  const featurePrefix = await getFeaturePrefix(codeql, features, language);

  // Assemble the cache key.
  return `${featurePrefix}${prefix}-${CODEQL_DEPENDENCY_CACHE_VERSION}-${runnerOs}-${language}-`;
}

/** Represents information about our overall cache usage for CodeQL dependency caches. */
export interface DependencyCachingUsageReport {
  count: number;
  size_bytes: number;
}

/**
 * Tries to determine the overall cache usage for CodeQL dependencies caches.
 *
 * @param logger The logger to log errors to.
 * @returns Returns the overall cache usage for CodeQL dependencies caches, or `undefined` if we couldn't determine it.
 */
export async function getDependencyCacheUsage(
  logger: Logger,
): Promise<DependencyCachingUsageReport | undefined> {
  try {
    const caches = await listActionsCaches(CODEQL_DEPENDENCY_CACHE_PREFIX);
    const totalSize = caches.reduce(
      (acc, cache) => acc + (cache.size_in_bytes ?? 0),
      0,
    );
    return { count: caches.length, size_bytes: totalSize };
  } catch (err) {
    logger.warning(
      `Unable to retrieve information about dependency cache usage: ${getErrorMessage(err)}`,
    );
  }

  return undefined;
}

export const internal = {
  makePatternCheck,
};
