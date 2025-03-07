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
exports.CODEQL_OVERLAY_MINIMUM_VERSION = exports.OverlayDatabaseMode = void 0;
exports.writeBaseDatabaseOidsFile = writeBaseDatabaseOidsFile;
exports.writeOverlayChangedFilesFile = writeOverlayChangedFilesFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const actions_util_1 = require("./actions-util");
const git_utils_1 = require("./git-utils");
const util_1 = require("./util");
var OverlayDatabaseMode;
(function (OverlayDatabaseMode) {
    OverlayDatabaseMode["Overlay"] = "overlay";
    OverlayDatabaseMode["OverlayBase"] = "overlay-base";
    OverlayDatabaseMode["None"] = "none";
})(OverlayDatabaseMode || (exports.OverlayDatabaseMode = OverlayDatabaseMode = {}));
exports.CODEQL_OVERLAY_MINIMUM_VERSION = "2.20.5";
async function writeBaseDatabaseOidsFile(config, sourceRoot) {
    const gitFileOids = await (0, git_utils_1.getAllFileOids)(sourceRoot);
    const gitFileOidsJson = JSON.stringify(gitFileOids);
    const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
    await fs.promises.writeFile(baseDatabaseOidsFilePath, gitFileOidsJson);
}
async function readBaseDatabaseOidsFile(config, logger) {
    const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
    try {
        const contents = await fs.promises.readFile(baseDatabaseOidsFilePath, "utf-8");
        return JSON.parse(contents);
    }
    catch (e) {
        logger.error("Failed to read overlay-base file OIDs from " +
            `${baseDatabaseOidsFilePath}: ${e.message || e}`);
        throw e;
    }
}
/**
 * Writes a JSON file containing the absolute paths of files under `sourceRoot`
 * that have changed (added, removed, or modified) relative to the overlay base
 * database.
 *
 * This function uses the Git index to determine which files have changed, so it
 * has a few limitations:
 *
 * - It requires that `sourceRoot` is inside a Git repository.
 * - It only works for files tracked by the Git repository that `sourceRoot` is
 *   in. If the Git repository has submodules, this function will not detect
 *   changes in those submodules.
 * - It assumes that the Git repository is in a clean state, i.e. there are no
 *   uncommitted changes in the repository.
 * - It assumes that all files of interest are tracked by Git, e.g. not covered
 *   by `.gitignore`.
 */
async function writeOverlayChangedFilesFile(config, sourceRoot, logger) {
    const gitRoot = await (0, git_utils_1.getGitRoot)(sourceRoot);
    if (!gitRoot) {
        throw new Error("Failed to determine Git repository root");
    }
    const baseFileOids = await readBaseDatabaseOidsFile(config, logger);
    const overlayFileOids = await (0, git_utils_1.getAllFileOids)(sourceRoot);
    const gitChangedFiles = computeChangedFiles(baseFileOids, overlayFileOids);
    const overlayChangedFiles = [];
    for (const pathInRepo of gitChangedFiles) {
        const absolutePath = path.join(gitRoot, pathInRepo);
        if ((0, util_1.pathStartsWith)(absolutePath, sourceRoot)) {
            overlayChangedFiles.push(absolutePath);
        }
    }
    logger.info(`Found ${overlayChangedFiles.length} changed file(s) ` +
        `under ${sourceRoot}.`);
    const changedFilesJson = JSON.stringify(overlayChangedFiles);
    const overlayChangedFilesFilePath = path.join((0, actions_util_1.getTemporaryDirectory)(), "overlay-changed-files.json");
    logger.debug("Writing overlay changed files to " +
        `${overlayChangedFilesFilePath}: ${changedFilesJson}`);
    await fs.promises.writeFile(overlayChangedFilesFilePath, changedFilesJson);
    return overlayChangedFilesFilePath;
}
function getBaseDatabaseOidsFilePath(config) {
    return path.join(config.dbLocation, "base-database-oids.json");
}
function computeChangedFiles(baseFileOids, overlayFileOids) {
    const changes = [];
    for (const [file, oid] of Object.entries(overlayFileOids)) {
        if (!(file in baseFileOids) || baseFileOids[file] !== oid) {
            changes.push(file);
        }
    }
    for (const file of Object.keys(baseFileOids)) {
        if (!(file in overlayFileOids)) {
            changes.push(file);
        }
    }
    return changes;
}
//# sourceMappingURL=overlay-database-utils.js.map