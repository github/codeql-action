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
exports.writeOverlayChangesFile = writeOverlayChangesFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const actions_util_1 = require("./actions-util");
const git_utils_1 = require("./git-utils");
var OverlayDatabaseMode;
(function (OverlayDatabaseMode) {
    OverlayDatabaseMode["Overlay"] = "overlay";
    OverlayDatabaseMode["OverlayBase"] = "overlay-base";
    OverlayDatabaseMode["None"] = "none";
})(OverlayDatabaseMode || (exports.OverlayDatabaseMode = OverlayDatabaseMode = {}));
exports.CODEQL_OVERLAY_MINIMUM_VERSION = "2.20.5";
/**
 * Writes a JSON file containing Git OIDs for all tracked files (represented
 * by path relative to the source root) under the source root. The file is
 * written into the database location specified in the config.
 *
 * @param config The configuration object containing the database location
 * @param sourceRoot The root directory containing the source files to process
 * @throws {Error} If the Git repository root cannot be determined
 */
async function writeBaseDatabaseOidsFile(config, sourceRoot) {
    const gitFileOids = await (0, git_utils_1.getFileOidsUnderPath)(sourceRoot);
    const gitFileOidsJson = JSON.stringify(gitFileOids);
    const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
    await fs.promises.writeFile(baseDatabaseOidsFilePath, gitFileOidsJson);
}
/**
 * Reads and parses the JSON file containing the base database Git OIDs.
 * This file contains the mapping of file paths to their corresponding Git OIDs
 * that was previously written by writeBaseDatabaseOidsFile().
 *
 * @param config The configuration object containing the database location
 * @param logger The logger instance to use for error reporting
 * @returns An object mapping file paths (relative to source root) to their Git OIDs
 * @throws {Error} If the file cannot be read or parsed
 */
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
function getBaseDatabaseOidsFilePath(config) {
    return path.join(config.dbLocation, "base-database-oids.json");
}
/**
 * Writes a JSON file containing the source-root-relative paths of files under
 * `sourceRoot` that have changed (added, removed, or modified) from the overlay
 * base database.
 *
 * This function uses the Git index to determine which files have changed, so it
 * requires the following preconditions, both when this function is called and
 * when the overlay-base database was initialized:
 *
 * - It requires that `sourceRoot` is inside a Git repository.
 * - It assumes that all changes in the working tree are staged in the index.
 * - It assumes that all files of interest are tracked by Git, e.g. not covered
 *   by `.gitignore`.
 */
async function writeOverlayChangesFile(config, sourceRoot, logger) {
    const baseFileOids = await readBaseDatabaseOidsFile(config, logger);
    const overlayFileOids = await (0, git_utils_1.getFileOidsUnderPath)(sourceRoot);
    const changedFiles = computeChangedFiles(baseFileOids, overlayFileOids);
    logger.info(`Found ${changedFiles.length} changed file(s) under ${sourceRoot}.`);
    const changedFilesJson = JSON.stringify({ changes: changedFiles });
    const overlayChangesFile = path.join((0, actions_util_1.getTemporaryDirectory)(), "overlay-changes.json");
    logger.debug(`Writing overlay changed files to ${overlayChangesFile}: ${changedFilesJson}`);
    await fs.promises.writeFile(overlayChangesFile, changedFilesJson);
    return overlayChangesFile;
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