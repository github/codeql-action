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
exports.downloadTrapCaches = downloadTrapCaches;
exports.uploadTrapCaches = uploadTrapCaches;
exports.cleanupTrapCaches = cleanupTrapCaches;
exports.getLanguagesSupportingCaching = getLanguagesSupportingCaching;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const actionsCache = __importStar(require("@actions/cache"));
const actionsUtil = __importStar(require("./actions-util"));
const apiClient = __importStar(require("./api-client"));
const doc_url_1 = require("./doc-url");
const feature_flags_1 = require("./feature-flags");
const gitUtils = __importStar(require("./git-utils"));
const util_1 = require("./util");
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
async function downloadTrapCaches(codeql, languages, logger) {
    const result = {};
    const languagesSupportingCaching = await getLanguagesSupportingCaching(codeql, languages, logger);
    logger.info(`Found ${languagesSupportingCaching.length} languages that support TRAP caching`);
    if (languagesSupportingCaching.length === 0)
        return result;
    const cachesDir = path.join(actionsUtil.getTemporaryDirectory(), "trapCaches");
    for (const language of languagesSupportingCaching) {
        const cacheDir = path.join(cachesDir, language);
        fs.mkdirSync(cacheDir, { recursive: true });
        result[language] = cacheDir;
    }
    if (await gitUtils.isAnalyzingDefaultBranch()) {
        logger.info("Analyzing default branch. Skipping downloading of TRAP caches.");
        return result;
    }
    let baseSha = "unknown";
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (actionsUtil.getWorkflowEventName() === "pull_request" &&
        eventPath !== undefined) {
        const event = JSON.parse(fs.readFileSync(path.resolve(eventPath), "utf-8"));
        baseSha = event.pull_request?.base?.sha || baseSha;
    }
    for (const language of languages) {
        const cacheDir = result[language];
        if (cacheDir === undefined)
            continue;
        // The SHA from the base of the PR is the most similar commit we might have a cache for
        const preferredKey = await cacheKey(codeql, language, baseSha);
        logger.info(`Looking in Actions cache for TRAP cache with key ${preferredKey}`);
        const found = await (0, util_1.withTimeout)(MAX_CACHE_OPERATION_MS, actionsCache.restoreCache([cacheDir], preferredKey, [
            // Fall back to any cache with the right key prefix
            await cachePrefix(codeql, language),
        ]), () => {
            logger.info(`Timed out downloading cache for ${language}, will continue without it`);
        });
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
async function uploadTrapCaches(codeql, config, logger) {
    if (!(await gitUtils.isAnalyzingDefaultBranch()))
        return false; // Only upload caches from the default branch
    for (const language of config.languages) {
        const cacheDir = config.trapCaches[language];
        if (cacheDir === undefined)
            continue;
        const trapFolderSize = await (0, util_1.tryGetFolderBytes)(cacheDir, logger);
        if (trapFolderSize === undefined) {
            logger.info(`Skipping upload of TRAP cache for ${language} as we couldn't determine its size`);
            continue;
        }
        if (trapFolderSize < MINIMUM_CACHE_MB_TO_UPLOAD * 1_048_576) {
            logger.info(`Skipping upload of TRAP cache for ${language} as it is too small`);
            continue;
        }
        const key = await cacheKey(codeql, language, process.env.GITHUB_SHA || "unknown");
        logger.info(`Uploading TRAP cache to Actions cache with key ${key}`);
        await (0, util_1.withTimeout)(MAX_CACHE_OPERATION_MS, actionsCache.saveCache([cacheDir], key), () => {
            logger.info(`Timed out waiting for TRAP cache for ${language} to upload, will continue without uploading`);
        });
    }
    return true;
}
async function cleanupTrapCaches(config, features, logger) {
    if (!(await features.getValue(feature_flags_1.Feature.CleanupTrapCaches))) {
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
        const allCaches = await apiClient.listActionsCaches(CODEQL_TRAP_CACHE_PREFIX, await gitUtils.getRef());
        for (const language of config.languages) {
            if (config.trapCaches[language]) {
                const cachesToRemove = await getTrapCachesForLanguage(allCaches, language, logger);
                // Dates returned by the API are in ISO 8601 format, so we can sort them lexicographically
                cachesToRemove.sort((a, b) => a.created_at.localeCompare(b.created_at));
                // Keep the most recent cache
                const mostRecentCache = cachesToRemove.pop();
                logger.debug(`Keeping most recent TRAP cache (${JSON.stringify(mostRecentCache)})`);
                if (cachesToRemove.length === 0) {
                    logger.info(`No TRAP caches to clean up for ${language}.`);
                    continue;
                }
                for (const cache of cachesToRemove) {
                    logger.debug(`Cleaning up TRAP cache (${JSON.stringify(cache)})`);
                    await apiClient.deleteActionsCache(cache.id);
                }
                const bytesCleanedUp = cachesToRemove.reduce((acc, item) => acc + item.size_in_bytes, 0);
                totalBytesCleanedUp += bytesCleanedUp;
                const megabytesCleanedUp = (bytesCleanedUp / (1024 * 1024)).toFixed(2);
                logger.info(`Cleaned up ${megabytesCleanedUp} MiB of old TRAP caches for ${language}.`);
            }
        }
        return { trap_cache_cleanup_size_bytes: totalBytesCleanedUp };
    }
    catch (e) {
        if ((0, util_1.isHTTPError)(e) && e.status === 403) {
            logger.warning("Could not cleanup TRAP caches as the token did not have the required permissions. " +
                'To clean up TRAP caches, ensure the token has the "actions:write" permission. ' +
                `See ${doc_url_1.DocUrl.ASSIGNING_PERMISSIONS_TO_JOBS} for more information.`);
        }
        else {
            logger.info(`Failed to cleanup TRAP caches, continuing. Details: ${e}`);
        }
        return { trap_cache_cleanup_error: (0, util_1.getErrorMessage)(e) };
    }
}
async function getTrapCachesForLanguage(allCaches, language, logger) {
    logger.debug(`Listing TRAP caches for ${language}`);
    for (const cache of allCaches) {
        if (!cache.created_at || !cache.id || !cache.key || !cache.size_in_bytes) {
            throw new Error("An unexpected cache item was returned from the API that was missing one or " +
                `more required fields: ${JSON.stringify(cache)}`);
        }
    }
    return allCaches.filter((cache) => {
        return cache.key?.includes(`-${language}-`);
    });
}
async function getLanguagesSupportingCaching(codeql, languages, logger) {
    const result = [];
    const resolveResult = await codeql.betterResolveLanguages();
    outer: for (const lang of languages) {
        const extractorsForLanguage = resolveResult.extractors[lang];
        if (extractorsForLanguage === undefined) {
            logger.info(`${lang} does not support TRAP caching (couldn't find an extractor)`);
            continue;
        }
        if (extractorsForLanguage.length !== 1) {
            logger.info(`${lang} does not support TRAP caching (found multiple extractors)`);
            continue;
        }
        const extractor = extractorsForLanguage[0];
        const trapCacheOptions = extractor.extractor_options?.trap?.properties?.cache?.properties;
        if (trapCacheOptions === undefined) {
            logger.info(`${lang} does not support TRAP caching (missing option group)`);
            continue;
        }
        for (const requiredOpt of ["dir", "bound", "write"]) {
            if (!(requiredOpt in trapCacheOptions)) {
                logger.info(`${lang} does not support TRAP caching (missing ${requiredOpt} option)`);
                continue outer;
            }
        }
        result.push(lang);
    }
    return result;
}
async function cacheKey(codeql, language, baseSha) {
    return `${await cachePrefix(codeql, language)}${baseSha}`;
}
async function cachePrefix(codeql, language) {
    return `${CODEQL_TRAP_CACHE_PREFIX}-${CACHE_VERSION}-${(await codeql.getVersion()).version}-${language}-`;
}
//# sourceMappingURL=trap-caching.js.map