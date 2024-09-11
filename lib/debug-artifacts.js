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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeArifactName = sanitizeArifactName;
exports.uploadAllAvailableDebugArtifacts = uploadAllAvailableDebugArtifacts;
exports.uploadDebugArtifacts = uploadDebugArtifacts;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const artifact = __importStar(require("@actions/artifact"));
const core = __importStar(require("@actions/core"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const del_1 = __importDefault(require("del"));
const actions_util_1 = require("./actions-util");
const analyze_1 = require("./analyze");
const codeql_1 = require("./codeql");
const environment_1 = require("./environment");
const util_1 = require("./util");
function sanitizeArifactName(name) {
    return name.replace(/[^a-zA-Z0-9_\\-]+/g, "");
}
async function uploadAllAvailableDebugArtifacts(config, logger) {
    const filesToUpload = [];
    const analyzeActionOutputDir = process.env[environment_1.EnvVar.SARIF_RESULTS_OUTPUT_DIR];
    for (const lang of config.languages) {
        // Add any SARIF files, if they exist
        if (analyzeActionOutputDir !== undefined &&
            fs.existsSync(analyzeActionOutputDir) &&
            fs.lstatSync(analyzeActionOutputDir).isDirectory()) {
            const sarifFile = path.resolve(analyzeActionOutputDir, `${lang}.sarif`);
            // Move SARIF to DB location so that they can be uploaded with the same root directory as the other artifacts.
            if (fs.existsSync(sarifFile)) {
                const sarifInDbLocation = path.resolve(config.dbLocation, `${lang}.sarif`);
                fs.renameSync(sarifFile, sarifInDbLocation);
                filesToUpload.push(sarifInDbLocation);
            }
        }
        // Add any log files
        const databaseDirectory = (0, util_1.getCodeQLDatabasePath)(config, lang);
        const logsDirectory = path.resolve(databaseDirectory, "log");
        if ((0, util_1.doesDirectoryExist)(logsDirectory)) {
            filesToUpload.push(...(0, util_1.listFolder)(logsDirectory));
        }
        // Multilanguage tracing: there are additional logs in the root of the cluster
        const multiLanguageTracingLogsDirectory = path.resolve(config.dbLocation, "log");
        if ((0, util_1.doesDirectoryExist)(multiLanguageTracingLogsDirectory)) {
            filesToUpload.push(...(0, util_1.listFolder)(multiLanguageTracingLogsDirectory));
        }
        // Add database bundle
        let databaseBundlePath;
        if (!(0, analyze_1.dbIsFinalized)(config, lang, logger)) {
            databaseBundlePath = await createPartialDatabaseBundle(config, lang);
        }
        else {
            databaseBundlePath = await createDatabaseBundleCli(config, lang);
        }
        filesToUpload.push(databaseBundlePath);
    }
    await uploadDebugArtifacts(filesToUpload, config.dbLocation, config.debugArtifactName);
}
async function uploadDebugArtifacts(toUpload, rootDir, artifactName) {
    if (toUpload.length === 0) {
        return;
    }
    let suffix = "";
    const matrix = (0, actions_util_1.getRequiredInput)("matrix");
    if (matrix) {
        try {
            for (const [, matrixVal] of Object.entries(JSON.parse(matrix)).sort())
                suffix += `-${matrixVal}`;
        }
        catch {
            core.info("Could not parse user-specified `matrix` input into JSON. The debug artifact will not be named with the user's `matrix` input.");
        }
    }
    try {
        await artifact.create().uploadArtifact(sanitizeArifactName(`${artifactName}${suffix}`), toUpload.map((file) => path.normalize(file)), path.normalize(rootDir), {
            continueOnError: true,
            // ensure we don't keep the debug artifacts around for too long since they can be large.
            retentionDays: 7,
        });
    }
    catch (e) {
        // A failure to upload debug artifacts should not fail the entire action.
        core.warning(`Failed to upload debug artifacts: ${e}`);
    }
}
/**
 * If a database has not been finalized, we cannot run the `codeql database bundle`
 * command in the CLI because it will return an error. Instead we directly zip
 * all files in the database folder and return the path.
 */
async function createPartialDatabaseBundle(config, language) {
    const databasePath = (0, util_1.getCodeQLDatabasePath)(config, language);
    const databaseBundlePath = path.resolve(config.dbLocation, `${config.debugDatabaseName}-${language}-partial.zip`);
    core.info(`${config.debugDatabaseName}-${language} is not finalized. Uploading partial database bundle at ${databaseBundlePath}...`);
    // See `bundleDb` for explanation behind deleting existing db bundle.
    if (fs.existsSync(databaseBundlePath)) {
        await (0, del_1.default)(databaseBundlePath, { force: true });
    }
    const zip = new adm_zip_1.default();
    zip.addLocalFolder(databasePath);
    zip.writeZip(databaseBundlePath);
    return databaseBundlePath;
}
/**
 * Runs `codeql database bundle` command and returns the path.
 */
async function createDatabaseBundleCli(config, language) {
    // Otherwise run `codeql database bundle` command.
    const databaseBundlePath = await (0, util_1.bundleDb)(config, language, await (0, codeql_1.getCodeQL)(config.codeQLCmd), `${config.debugDatabaseName}-${language}`);
    return databaseBundlePath;
}
//# sourceMappingURL=debug-artifacts.js.map