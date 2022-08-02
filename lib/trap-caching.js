"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadTrapCaches = exports.downloadTrapCaches = exports.getTrapCachingExtractorConfigArgsForLang = exports.getTrapCachingExtractorConfigArgs = void 0;
const actionsUtil = __importStar(require("./actions-util"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const cache = __importStar(require("@actions/cache"));
async function getTrapCachingExtractorConfigArgs(config) {
    const result = [];
    for (const language of config.languages)
        result.push(...await getTrapCachingExtractorConfigArgsForLang(config, language));
    return result;
}
exports.getTrapCachingExtractorConfigArgs = getTrapCachingExtractorConfigArgs;
async function getTrapCachingExtractorConfigArgsForLang(config, language) {
    const cache = config.trapCaches[language];
    if (cache === undefined)
        return [];
    const shouldWrite = await actionsUtil.isAnalyzingDefaultBranch();
    return [`-O="${language}.trap.cache.dir=${cache}"`, `-O="${language}.trap.cache.bound=1024"`, `-O="${language}.trap.cache.write=${shouldWrite}"`];
}
exports.getTrapCachingExtractorConfigArgsForLang = getTrapCachingExtractorConfigArgsForLang;
async function downloadTrapCaches(codeql, languages, logger) {
    const result = {};
    const languagesSupportingCaching = await getLanguagesSupportingCaching(codeql, languages);
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
exports.downloadTrapCaches = downloadTrapCaches;
async function uploadTrapCaches(config, logger) {
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
exports.uploadTrapCaches = uploadTrapCaches;
async function getLanguagesSupportingCaching(codeql, languages) {
    const resolveResult = await codeql.betterResolveLanguages();
    const result = [];
    for (const lang of languages) {
        const extractorOptions = resolveResult.extractors[lang][0]["extractor_options"];
        if (extractorOptions === undefined)
            continue;
        const trapOptions = extractorOptions["trap"];
        if (trapOptions === undefined)
            continue;
        const trapCacheOptions = trapOptions["cache"];
        if (trapCacheOptions === undefined)
            continue;
        if (trapCacheOptions.includes("dir") && trapCacheOptions.includes("bound") && trapCacheOptions.includes("write"))
            result.push(lang);
    }
    return result;
}
function cacheKey(language) {
    return `codeql-trap-cache-${language}`;
}
//# sourceMappingURL=trap-caching.js.map