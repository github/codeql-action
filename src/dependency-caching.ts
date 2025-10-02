import * as os from "os";
import { join } from "path";

import * as actionsCache from "@actions/cache";
import * as glob from "@actions/glob";

import { getTemporaryDirectory } from "./actions-util";
import { listActionsCaches } from "./api-client";
import { getTotalCacheSize } from "./caching-utils";
import { Config } from "./config-utils";
import { EnvVar } from "./environment";
import { KnownLanguage, Language } from "./languages";
import { Logger } from "./logging";
import { getErrorMessage, getRequiredEnvParam } from "./util";

/**
 * Caching configuration for a particular language.
 */
interface CacheConfig {
  /** The paths of directories on the runner that should be included in the cache. */
  paths: string[];
  /**
   * Patterns for the paths of files whose contents affect which dependencies are used
   * by a project. We find all files which match these patterns, calculate a hash for
   * their contents, and use that hash as part of the cache key.
   */
  hash: string[];
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
 * Default caching configurations per language.
 */
function getDefaultCacheConfig(): { [language: string]: CacheConfig } {
  return {
    java: {
      paths: [
        // Maven
        join(os.homedir(), ".m2", "repository"),
        // Gradle
        join(os.homedir(), ".gradle", "caches"),
        // CodeQL Java build-mode: none
        getJavaTempDependencyDir(),
      ],
      hash: [
        // Maven
        "**/pom.xml",
        // Gradle
        "**/*.gradle*",
        "**/gradle-wrapper.properties",
        "buildSrc/**/Versions.kt",
        "buildSrc/**/Dependencies.kt",
        "gradle/*.versions.toml",
        "**/versions.properties",
      ],
    },
    csharp: {
      paths: [join(os.homedir(), ".nuget", "packages")],
      hash: [
        // NuGet
        "**/packages.lock.json",
        // Paket
        "**/paket.lock",
      ],
    },
    go: {
      paths: [join(os.homedir(), "go", "pkg", "mod")],
      hash: ["**/go.sum"],
    },
  };
}

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
 * Attempts to restore dependency caches for the languages being analyzed.
 *
 * @param languages The languages being analyzed.
 * @param logger A logger to record some informational messages to.
 * @param minimizeJavaJars Whether the Java extractor should rewrite downloaded JARs to minimize their size.
 * @returns An array of `DependencyCacheRestoreStatus` objects for each analysed language with a caching configuration.
 */
export async function downloadDependencyCaches(
  languages: Language[],
  logger: Logger,
  minimizeJavaJars: boolean,
): Promise<DependencyCacheRestoreStatusReport> {
  const status: DependencyCacheRestoreStatusReport = [];

  for (const language of languages) {
    const cacheConfig = getDefaultCacheConfig()[language];

    if (cacheConfig === undefined) {
      logger.info(
        `Skipping download of dependency cache for ${language} as we have no caching configuration for it.`,
      );
      continue;
    }

    // Check that we can find files to calculate the hash for the cache key from, so we don't end up
    // with an empty string.
    const globber = await makeGlobber(cacheConfig.hash);

    if ((await globber.glob()).length === 0) {
      status.push({ language, hit_kind: CacheHitKind.NoHash });
      logger.info(
        `Skipping download of dependency cache for ${language} as we cannot calculate a hash for the cache key.`,
      );
      continue;
    }

    const primaryKey = await cacheKey(language, cacheConfig, minimizeJavaJars);
    const restoreKeys: string[] = [
      await cachePrefix(language, minimizeJavaJars),
    ];

    logger.info(
      `Downloading cache for ${language} with key ${primaryKey} and restore keys ${restoreKeys.join(
        ", ",
      )}`,
    );

    const start = performance.now();
    const hitKey = await actionsCache.restoreCache(
      cacheConfig.paths,
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
 * @param config The configuration for this workflow.
 * @param logger A logger to record some informational messages to.
 * @param minimizeJavaJars Whether the Java extractor should rewrite downloaded JARs to minimize their size.
 *
 * @returns An array of `DependencyCacheUploadStatus` objects for each analysed language with a caching configuration.
 */
export async function uploadDependencyCaches(
  config: Config,
  logger: Logger,
  minimizeJavaJars: boolean,
): Promise<DependencyCacheUploadStatusReport> {
  const status: DependencyCacheUploadStatusReport = [];
  for (const language of config.languages) {
    const cacheConfig = getDefaultCacheConfig()[language];

    if (cacheConfig === undefined) {
      logger.info(
        `Skipping upload of dependency cache for ${language} as we have no caching configuration for it.`,
      );
      continue;
    }

    // Check that we can find files to calculate the hash for the cache key from, so we don't end up
    // with an empty string.
    const globber = await makeGlobber(cacheConfig.hash);

    if ((await globber.glob()).length === 0) {
      status.push({ language, result: CacheStoreResult.NoHash });
      logger.info(
        `Skipping upload of dependency cache for ${language} as we cannot calculate a hash for the cache key.`,
      );
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
    const size = await getTotalCacheSize(cacheConfig.paths, logger, true);

    // Skip uploading an empty cache.
    if (size === 0) {
      status.push({ language, result: CacheStoreResult.Empty });
      logger.info(
        `Skipping upload of dependency cache for ${language} since it is empty.`,
      );
      continue;
    }

    const key = await cacheKey(language, cacheConfig, minimizeJavaJars);

    logger.info(
      `Uploading cache of size ${size} for ${language} with key ${key}...`,
    );

    try {
      const start = performance.now();
      await actionsCache.saveCache(cacheConfig.paths, key);
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
 * @param language The language being analyzed.
 * @param cacheConfig The cache configuration for the language.
 * @param minimizeJavaJars Whether the Java extractor should rewrite downloaded JARs to minimize their size.
 * @returns A cache key capturing information about the project(s) being analyzed in the specified language.
 */
async function cacheKey(
  language: Language,
  cacheConfig: CacheConfig,
  minimizeJavaJars: boolean = false,
): Promise<string> {
  const hash = await glob.hashFiles(cacheConfig.hash.join("\n"));
  return `${await cachePrefix(language, minimizeJavaJars)}${hash}`;
}

/**
 * Constructs a prefix for the cache key, comprised of a CodeQL-specific prefix, a version number that
 * can be changed to invalidate old caches, the runner's operating system, and the specified language name.
 *
 * @param language The language being analyzed.
 * @param minimizeJavaJars Whether the Java extractor should rewrite downloaded JARs to minimize their size.
 * @returns The prefix that identifies what a cache is for.
 */
async function cachePrefix(
  language: Language,
  minimizeJavaJars: boolean,
): Promise<string> {
  const runnerOs = getRequiredEnvParam("RUNNER_OS");
  const customPrefix = process.env[EnvVar.DEPENDENCY_CACHING_PREFIX];
  let prefix = CODEQL_DEPENDENCY_CACHE_PREFIX;

  if (customPrefix !== undefined && customPrefix.length > 0) {
    prefix = `${prefix}-${customPrefix}`;
  }

  // To ensure a safe rollout of JAR minimization, we change the key when the feature is enabled.
  if (language === KnownLanguage.java && minimizeJavaJars) {
    prefix = `minify-${prefix}`;
  }

  return `${prefix}-${CODEQL_DEPENDENCY_CACHE_VERSION}-${runnerOs}-${language}-`;
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
