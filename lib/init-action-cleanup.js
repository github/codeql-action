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
exports.uploadDatabaseBundleDebugArtifact = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const del_1 = __importDefault(require("del"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const logging_1 = require("./logging");
const util_1 = require("./util");
function listFolder(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
        if (entry.isFile()) {
            files.push(path.resolve(dir, entry.name));
        }
        else if (entry.isDirectory()) {
            files = files.concat(listFolder(path.resolve(dir, entry.name)));
        }
    }
    return files;
}
async function uploadDatabaseBundleDebugArtifact(config, logger) {
    for (const language of config.languages) {
        if (!(0, analyze_1.dbIsFinalized)(config, language, logger)) {
            core.info(`${config.debugDatabaseName}-${language} is not finalized. Uploading partial database bundle...`);
            // Zip up files and upload directly.
            const databasePath = (0, util_1.getCodeQLDatabasePath)(config, language);
            const databaseBundlePath = path.resolve(config.dbLocation, `${config.debugDatabaseName}.zip`);
            // See `bundleDb` for explanation behind deleting existing db bundle.
            if (fs.existsSync(databaseBundlePath)) {
                await (0, del_1.default)(databaseBundlePath, { force: true });
            }
            const zip = new adm_zip_1.default();
            zip.addLocalFolder(databasePath);
            zip.writeZip(databaseBundlePath);
            await actionsUtil.uploadDebugArtifacts([databaseBundlePath], config.dbLocation, config.debugArtifactName);
            continue;
        }
        try {
            // Otherwise run `codeql database bundle` command.
            const toUpload = [];
            toUpload.push(await (0, util_1.bundleDb)(config, language, await (0, codeql_1.getCodeQL)(config.codeQLCmd), `${config.debugDatabaseName}-${language}`));
            await actionsUtil.uploadDebugArtifacts(toUpload, config.dbLocation, config.debugArtifactName);
        }
        catch (error) {
            core.info(`Failed to upload database debug bundles for ${config.debugDatabaseName}-${language}: ${error}`);
        }
    }
}
exports.uploadDatabaseBundleDebugArtifact = uploadDatabaseBundleDebugArtifact;
async function uploadLogsDebugArtifact(config) {
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    let toUpload = [];
    for (const language of config.languages) {
        const databaseDirectory = (0, util_1.getCodeQLDatabasePath)(config, language);
        const logsDirectory = path.resolve(databaseDirectory, "log");
        if (actionsUtil.doesDirectoryExist(logsDirectory)) {
            toUpload = toUpload.concat(listFolder(logsDirectory));
        }
    }
    if (await (0, util_1.codeQlVersionAbove)(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING)) {
        // Multilanguage tracing: there are additional logs in the root of the cluster
        const multiLanguageTracingLogsDirectory = path.resolve(config.dbLocation, "log");
        if (actionsUtil.doesDirectoryExist(multiLanguageTracingLogsDirectory)) {
            toUpload = toUpload.concat(listFolder(multiLanguageTracingLogsDirectory));
        }
    }
    await actionsUtil.uploadDebugArtifacts(toUpload, config.dbLocation, config.debugArtifactName);
    // Before multi-language tracing, we wrote a compound-build-tracer.log in the temp dir
    if (!(await (0, util_1.codeQlVersionAbove)(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING))) {
        const compoundBuildTracerLogDirectory = path.resolve(config.tempDir, "compound-build-tracer.log");
        if (actionsUtil.doesDirectoryExist(compoundBuildTracerLogDirectory)) {
            await actionsUtil.uploadDebugArtifacts([compoundBuildTracerLogDirectory], config.tempDir, config.debugArtifactName);
        }
    }
}
async function uploadFinalLogsDebugArtifact(config) {
    core.info("Debug mode is on. Printing CodeQL debug logs...");
    for (const language of config.languages) {
        const databaseDirectory = (0, util_1.getCodeQLDatabasePath)(config, language);
        const logsDirectory = path.join(databaseDirectory, "log");
        if (!actionsUtil.doesDirectoryExist(logsDirectory)) {
            core.info(`Directory ${logsDirectory} does not exist.`);
            continue; // Skip this language database.
        }
        const walkLogFiles = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            if (entries.length === 0) {
                core.info(`No debug logs found at directory ${logsDirectory}.`);
            }
            for (const entry of entries) {
                if (entry.isFile()) {
                    core.startGroup(`CodeQL Debug Logs - ${language} - ${entry.name}`);
                    process.stdout.write(fs.readFileSync(path.resolve(dir, entry.name)));
                    core.endGroup();
                }
                else if (entry.isDirectory()) {
                    walkLogFiles(path.resolve(dir, entry.name));
                }
            }
        };
        walkLogFiles(logsDirectory);
    }
}
async function run() {
    const logger = (0, logging_1.getActionsLogger)();
    let config = undefined;
    config = await (0, config_utils_1.getConfig)(actionsUtil.getTemporaryDirectory(), logger);
    if (config === undefined) {
        throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
    }
    // Upload appropriate Actions artifacts for debugging
    if (config === null || config === void 0 ? void 0 : config.debugMode) {
        await uploadDatabaseBundleDebugArtifact(config, logger);
        await uploadLogsDebugArtifact(config);
        await uploadFinalLogsDebugArtifact(config);
    }
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`init action cleanup failed: ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=init-action-cleanup.js.map