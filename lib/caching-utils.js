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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachingKind = void 0;
exports.getTotalCacheSize = getTotalCacheSize;
exports.shouldStoreCache = shouldStoreCache;
exports.shouldRestoreCache = shouldRestoreCache;
exports.getCachingKind = getCachingKind;
exports.getDependencyCachingEnabled = getDependencyCachingEnabled;
const core = __importStar(require("@actions/core"));
const actions_util_1 = require("./actions-util");
const environment_1 = require("./environment");
const util_1 = require("./util");
/**
 * Returns the total size of all the specified paths.
 * @param paths The paths for which to calculate the total size.
 * @param logger A logger to record some informational messages to.
 * @returns The total size of all specified paths.
 */
async function getTotalCacheSize(paths, logger) {
    const sizes = await Promise.all(paths.map((cacheDir) => (0, util_1.tryGetFolderBytes)(cacheDir, logger)));
    return sizes.map((a) => a || 0).reduce((a, b) => a + b, 0);
}
/* Enumerates caching modes. */
var CachingKind;
(function (CachingKind) {
    /** Do not restore or store any caches. */
    CachingKind["None"] = "none";
    /** Store caches, but do not restore any existing ones. */
    CachingKind["Store"] = "store";
    /** Restore existing caches, but do not store any new ones. */
    CachingKind["Restore"] = "restore";
    /** Restore existing caches, and store new ones. */
    CachingKind["Full"] = "full";
})(CachingKind || (exports.CachingKind = CachingKind = {}));
/** Returns a value indicating whether new caches should be stored, based on `kind`. */
function shouldStoreCache(kind) {
    return kind === CachingKind.Full || kind === CachingKind.Store;
}
/** Returns a value indicating whether existing caches should be restored, based on `kind`. */
function shouldRestoreCache(kind) {
    return kind === CachingKind.Full || kind === CachingKind.Restore;
}
/**
 * Parses the `upload` input into an `UploadKind`, converting unspecified and deprecated upload
 * inputs appropriately.
 */
function getCachingKind(input) {
    switch (input) {
        case undefined:
        case "none":
        case "off":
        case "false":
            return CachingKind.None;
        case "full":
        case "on":
        case "true":
            return CachingKind.Full;
        case "store":
            return CachingKind.Store;
        case "restore":
            return CachingKind.Restore;
        default:
            core.warning(`Unrecognized 'dependency-caching' input: ${input}. Defaulting to 'none'.`);
            return CachingKind.None;
    }
}
/** Determines whether dependency caching is enabled. */
function getDependencyCachingEnabled() {
    // If the workflow specified something always respect that
    const dependencyCaching = (0, actions_util_1.getOptionalInput)("dependency-caching") ||
        process.env[environment_1.EnvVar.DEPENDENCY_CACHING];
    if (dependencyCaching !== undefined)
        return getCachingKind(dependencyCaching);
    // On self-hosted runners which may have dependencies installed centrally, disable caching by default
    if (!(0, util_1.isHostedRunner)())
        return CachingKind.None;
    // Disable in advanced workflows by default.
    if (!(0, actions_util_1.isDefaultSetup)())
        return CachingKind.None;
    // On hosted runners, enable dependency caching by default
    return CachingKind.Full;
}
//# sourceMappingURL=caching-utils.js.map