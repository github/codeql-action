"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadDependencyCaches = downloadDependencyCaches;
exports.uploadDependencyCaches = uploadDependencyCaches;
const os = __importStar(require("os"));
const path_1 = require("path");
const actionsCache = __importStar(require("@actions/cache"));
const glob = __importStar(require("@actions/glob"));
const caching_utils_1 = require("./caching-utils");
const environment_1 = require("./environment");
const util_1 = require("./util");
const CODEQL_DEPENDENCY_CACHE_PREFIX = "codeql-dependencies";
const CODEQL_DEPENDENCY_CACHE_VERSION = 1;
/**
 * Default caching configurations per language.
 */
const CODEQL_DEFAULT_CACHE_CONFIG = {
    java: {
        paths: [
            // Maven
            (0, path_1.join)(os.homedir(), ".m2", "repository"),
            // Gradle
            (0, path_1.join)(os.homedir(), ".gradle", "caches"),
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
        paths: [(0, path_1.join)(os.homedir(), ".nuget", "packages")],
        hash: [
            // NuGet
            "**/packages.lock.json",
            // Paket
            "**/paket.lock",
        ],
    },
    go: {
        paths: [(0, path_1.join)(os.homedir(), "go", "pkg", "mod")],
        hash: ["**/go.sum"],
    },
};
async function makeGlobber(patterns) {
    return glob.create(patterns.join("\n"));
}
/**
 * Attempts to restore dependency caches for the languages being analyzed.
 *
 * @param languages The languages being analyzed.
 * @param logger A logger to record some informational messages to.
 * @returns A list of languages for which dependency caches were restored.
 */
async function downloadDependencyCaches(languages, logger) {
    const restoredCaches = [];
    for (const language of languages) {
        const cacheConfig = CODEQL_DEFAULT_CACHE_CONFIG[language];
        if (cacheConfig === undefined) {
            logger.info(`Skipping download of dependency cache for ${language} as we have no caching configuration for it.`);
            continue;
        }
        // Check that we can find files to calculate the hash for the cache key from, so we don't end up
        // with an empty string.
        const globber = await makeGlobber(cacheConfig.hash);
        if ((await globber.glob()).length === 0) {
            logger.info(`Skipping download of dependency cache for ${language} as we cannot calculate a hash for the cache key.`);
            continue;
        }
        const primaryKey = await cacheKey(language, cacheConfig);
        const restoreKeys = [await cachePrefix(language)];
        logger.info(`Downloading cache for ${language} with key ${primaryKey} and restore keys ${restoreKeys.join(", ")}`);
        const hitKey = await actionsCache.restoreCache(cacheConfig.paths, primaryKey, restoreKeys);
        if (hitKey !== undefined) {
            logger.info(`Cache hit on key ${hitKey} for ${language}.`);
            restoredCaches.push(language);
        }
        else {
            logger.info(`No suitable cache found for ${language}.`);
        }
    }
    return restoredCaches;
}
/**
 * Attempts to store caches for the languages that were analyzed.
 *
 * @param config The configuration for this workflow.
 * @param logger A logger to record some informational messages to.
 */
async function uploadDependencyCaches(config, logger) {
    for (const language of config.languages) {
        const cacheConfig = CODEQL_DEFAULT_CACHE_CONFIG[language];
        if (cacheConfig === undefined) {
            logger.info(`Skipping upload of dependency cache for ${language} as we have no caching configuration for it.`);
            continue;
        }
        // Check that we can find files to calculate the hash for the cache key from, so we don't end up
        // with an empty string.
        const globber = await makeGlobber(cacheConfig.hash);
        if ((await globber.glob()).length === 0) {
            logger.info(`Skipping upload of dependency cache for ${language} as we cannot calculate a hash for the cache key.`);
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
        const size = await (0, caching_utils_1.getTotalCacheSize)(cacheConfig.paths, logger, true);
        // Skip uploading an empty cache.
        if (size === 0) {
            logger.info(`Skipping upload of dependency cache for ${language} since it is empty.`);
            continue;
        }
        const key = await cacheKey(language, cacheConfig);
        logger.info(`Uploading cache of size ${size} for ${language} with key ${key}...`);
        try {
            await actionsCache.saveCache(cacheConfig.paths, key);
        }
        catch (error) {
            // `ReserveCacheError` indicates that the cache key is already in use, which means that a
            // cache with that key already exists or is in the process of being uploaded by another
            // workflow. We can ignore this.
            if (error instanceof actionsCache.ReserveCacheError) {
                logger.info(`Not uploading cache for ${language}, because ${key} is already in use.`);
                logger.debug(error.message);
            }
            else {
                // Propagate other errors upwards.
                throw error;
            }
        }
    }
}
/**
 * Computes a cache key for the specified language.
 *
 * @param language The language being analyzed.
 * @param cacheConfig The cache configuration for the language.
 * @returns A cache key capturing information about the project(s) being analyzed in the specified language.
 */
async function cacheKey(language, cacheConfig) {
    const hash = await glob.hashFiles(cacheConfig.hash.join("\n"));
    return `${await cachePrefix(language)}${hash}`;
}
/**
 * Constructs a prefix for the cache key, comprised of a CodeQL-specific prefix, a version number that
 * can be changed to invalidate old caches, the runner's operating system, and the specified language name.
 *
 * @param language The language being analyzed.
 * @returns The prefix that identifies what a cache is for.
 */
async function cachePrefix(language) {
    const runnerOs = (0, util_1.getRequiredEnvParam)("RUNNER_OS");
    const customPrefix = process.env[environment_1.EnvVar.DEPENDENCY_CACHING_PREFIX];
    let prefix = CODEQL_DEPENDENCY_CACHE_PREFIX;
    if (customPrefix !== undefined && customPrefix.length > 0) {
        prefix = `${prefix}-${customPrefix}`;
    }
    return `${prefix}-${CODEQL_DEPENDENCY_CACHE_VERSION}-${runnerOs}-${language}-`;
}
//# sourceMappingURL=dependency-caching.js.map