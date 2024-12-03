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
 * @param quiet A value indicating whether to suppress logging warnings (default: false).
 * @returns The total size of all specified paths.
 */
async function getTotalCacheSize(paths, logger, quiet = false) {
    const sizes = await Promise.all(paths.map((cacheDir) => (0, util_1.tryGetFolderBytes)(cacheDir, logger, quiet)));
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
 * Parses the `upload` input into an `UploadKind`.
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
    // On hosted runners, disable dependency caching by default.
    // TODO: Review later whether we can enable this by default.
    return CachingKind.None;
}
//# sourceMappingURL=caching-utils.js.map