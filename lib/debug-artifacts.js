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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDatabaseBundleDebugArtifact = exports.uploadLogsDebugArtifact = exports.uploadSarifDebugArtifact = exports.uploadDebugArtifacts = exports.sanitizeArifactName = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const artifact = __importStar(require("@actions/artifact"));
const core = __importStar(require("@actions/core"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const del_1 = __importDefault(require("del"));
const actions_util_1 = require("./actions-util");
const analyze_1 = require("./analyze");
const codeql_1 = require("./codeql");
const util_1 = require("./util");
function sanitizeArifactName(name) {
    return name.replace(/[^a-zA-Z0-9_\\-]+/g, "");
}
exports.sanitizeArifactName = sanitizeArifactName;
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
        catch (e) {
            core.info("Could not parse user-specified `matrix` input into JSON. The debug artifact will not be named with the user's `matrix` input.");
        }
    }
    await artifact.create().uploadArtifact(sanitizeArifactName(`${artifactName}${suffix}`), toUpload.map((file) => path.normalize(file)), path.normalize(rootDir));
}
exports.uploadDebugArtifacts = uploadDebugArtifacts;
async function uploadSarifDebugArtifact(config, outputDir) {
    if (!(0, util_1.doesDirectoryExist)(outputDir)) {
        return;
    }
    let toUpload = [];
    for (const lang of config.languages) {
        const sarifFile = path.resolve(outputDir, `${lang}.sarif`);
        if (fs.existsSync(sarifFile)) {
            toUpload = toUpload.concat(sarifFile);
        }
    }
    await uploadDebugArtifacts(toUpload, outputDir, config.debugArtifactName);
}
exports.uploadSarifDebugArtifact = uploadSarifDebugArtifact;
async function uploadLogsDebugArtifact(config) {
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    let toUpload = [];
    for (const language of config.languages) {
        const databaseDirectory = (0, util_1.getCodeQLDatabasePath)(config, language);
        const logsDirectory = path.resolve(databaseDirectory, "log");
        if ((0, util_1.doesDirectoryExist)(logsDirectory)) {
            toUpload = toUpload.concat((0, util_1.listFolder)(logsDirectory));
        }
    }
    if (await (0, util_1.codeQlVersionAbove)(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING)) {
        // Multilanguage tracing: there are additional logs in the root of the cluster
        const multiLanguageTracingLogsDirectory = path.resolve(config.dbLocation, "log");
        if ((0, util_1.doesDirectoryExist)(multiLanguageTracingLogsDirectory)) {
            toUpload = toUpload.concat((0, util_1.listFolder)(multiLanguageTracingLogsDirectory));
        }
    }
    await uploadDebugArtifacts(toUpload, config.dbLocation, config.debugArtifactName);
    // Before multi-language tracing, we wrote a compound-build-tracer.log in the temp dir
    if (!(await (0, util_1.codeQlVersionAbove)(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING))) {
        const compoundBuildTracerLogDirectory = path.resolve(config.tempDir, "compound-build-tracer.log");
        if ((0, util_1.doesDirectoryExist)(compoundBuildTracerLogDirectory)) {
            await uploadDebugArtifacts([compoundBuildTracerLogDirectory], config.tempDir, config.debugArtifactName);
        }
    }
}
exports.uploadLogsDebugArtifact = uploadLogsDebugArtifact;
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
async function uploadDatabaseBundleDebugArtifact(config, logger) {
    for (const language of config.languages) {
        try {
            let databaseBundlePath;
            if (!(0, analyze_1.dbIsFinalized)(config, language, logger)) {
                databaseBundlePath = await createPartialDatabaseBundle(config, language);
            }
            else {
                databaseBundlePath = await createDatabaseBundleCli(config, language);
            }
            await uploadDebugArtifacts([databaseBundlePath], config.dbLocation, config.debugArtifactName);
        }
        catch (error) {
            core.info(`Failed to upload database debug bundle for ${config.debugDatabaseName}-${language}: ${error}`);
        }
    }
}
exports.uploadDatabaseBundleDebugArtifact = uploadDatabaseBundleDebugArtifact;
//# sourceMappingURL=debug-artifacts.js.map