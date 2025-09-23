import * as os from "os";
import { join } from "path";

import * as actionsCache from "@actions/cache";
import * as glob from "@actions/glob";

import { getTemporaryDirectory } from "./actions-util";
import { getTotalCacheSize } from "./caching-utils";
import { Config } from "./config-utils";
import { EnvVar } from "./environment";
import { KnownLanguage, Language } from "./languages";
import { Logger } from "./logging";
import { getRequiredEnvParam } from "./util";

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
export enum CacheHitResult {
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
  hit: CacheHitResult;
  download_size_bytes?: number;
  download_duration_ms?: number;
}

/** A partial mapping from languages to the results of restoring dependency caches for them. */
export type DependencyCacheRestoreStatusReport = Partial<
  Record<Language, DependencyCacheRestoreStatus>
>;

/**
 * Attempts to restore dependency caches for the languages being analyzed.
 *
 * @param languages The languages being analyzed.
 * @param logger A logger to record some informational messages to.
 * @param minimizeJavaJars Whether the Java extractor should rewrite downloaded JARs to minimize their size.
 * @returns A partial mapping of languages to results of restoring dependency caches for them.
 */
export async function downloadDependencyCaches(
  languages: Language[],
  logger: Logger,
  minimizeJavaJars: boolean,
): Promise<DependencyCacheRestoreStatusReport> {
  const status: DependencyCacheRestoreStatusReport = {};

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
      status[language] = { hit: CacheHitResult.NoHash };
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
    const download_size_bytes = Math.round(
      await getTotalCacheSize(cacheConfig.paths, logger),
    );

    if (hitKey !== undefined) {
      logger.info(`Cache hit on key ${hitKey} for ${language}.`);
      const hit =
        hitKey === primaryKey ? CacheHitResult.Exact : CacheHitResult.Partial;
      status[language] = { hit, download_duration_ms, download_size_bytes };
    } else {
      status[language] = { hit: CacheHitResult.Miss };
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
  result: CacheStoreResult;
  upload_size_bytes?: number;
  upload_duration_ms?: number;
}

/** A partial mapping from languages to the results of uploading dependency caches for them. */
export type DependencyCacheUploadStatusReport = Partial<
  Record<Language, DependencyCacheUploadStatus>
>;

/**
 * Attempts to store caches for the languages that were analyzed.
 *
 * @param config The configuration for this workflow.
 * @param logger A logger to record some informational messages to.
 * @param minimizeJavaJars Whether the Java extractor should rewrite downloaded JARs to minimize their size.
 *
 * @returns A partial mapping of languages to results of uploading dependency caches for them.
 */
export async function uploadDependencyCaches(
  config: Config,
  logger: Logger,
  minimizeJavaJars: boolean,
): Promise<DependencyCacheUploadStatusReport> {
  const status: DependencyCacheUploadStatusReport = {};
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
      status[language] = { result: CacheStoreResult.NoHash };
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
      status[language] = { result: CacheStoreResult.Empty };
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

      status[language] = {
        result: CacheStoreResult.Stored,
        upload_size_bytes: Math.round(size),
        upload_duration_ms,
      };
    } catch (error) {
      // `ReserveCacheError` indicates that the cache key is already in use, which means that a
      // cache with that key already exists or is in the process of being uploaded by another
      // workflow. We can ignore this.
      if (error instanceof actionsCache.ReserveCacheError) {
        logger.info(
          `Not uploading cache for ${language}, because ${key} is already in use.`,
        );
        logger.debug(error.message);

        status[language] = { result: CacheStoreResult.Duplicate };
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
