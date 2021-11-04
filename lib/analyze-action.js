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
exports.runPromise = exports.sendStatusReport = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const artifact = __importStar(require("@actions/artifact"));
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const database_upload_1 = require("./database-upload");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendStatusReport(startedAt, stats, error) {
    const status = (stats === null || stats === void 0 ? void 0 : stats.analyze_failure_language) !== undefined || error !== undefined
        ? "failure"
        : "success";
    const statusReportBase = await actionsUtil.createStatusReportBase("finish", status, startedAt, error === null || error === void 0 ? void 0 : error.message, error === null || error === void 0 ? void 0 : error.stack);
    const statusReport = {
        ...statusReportBase,
        ...(stats || {}),
    };
    await actionsUtil.sendStatusReport(statusReport);
}
exports.sendStatusReport = sendStatusReport;
async function run() {
    const startedAt = new Date();
    let uploadStats = undefined;
    let runStats = undefined;
    let config = undefined;
    util.initializeEnvironment(util.Mode.actions, pkg.version);
    try {
        if (!(await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("finish", "starting", startedAt)))) {
            return;
        }
        const logger = (0, logging_1.getActionsLogger)();
        config = await (0, config_utils_1.getConfig)(actionsUtil.getTemporaryDirectory(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        await util.enrichEnvironment(util.Mode.actions, await (0, codeql_1.getCodeQL)(config.codeQLCmd));
        const apiDetails = {
            auth: actionsUtil.getRequiredInput("token"),
            url: util.getRequiredEnvParam("GITHUB_SERVER_URL"),
        };
        const outputDir = actionsUtil.getRequiredInput("output");
        const threads = util.getThreadsFlag(actionsUtil.getOptionalInput("threads") || process.env["CODEQL_THREADS"], logger);
        const memory = util.getMemoryFlag(actionsUtil.getOptionalInput("ram") || process.env["CODEQL_RAM"]);
        await (0, analyze_1.runFinalize)(outputDir, threads, memory, config, logger);
        if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
            runStats = await (0, analyze_1.runQueries)(outputDir, memory, util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")), threads, actionsUtil.getOptionalInput("category"), config, logger);
            if (config.debugMode) {
                // Upload the SARIF files as an Actions artifact for debugging
                await uploadDebugArtifacts(config.languages.map((lang) => path.resolve(outputDir, `${lang}.sarif`)), outputDir);
            }
        }
        const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
        if (config.debugMode) {
            // Upload the logs as an Actions artifact for debugging
            const toUpload = [];
            for (const language of config.languages) {
                toUpload.push(...listFolder(path.resolve(util.getCodeQLDatabasePath(config, language), "log")));
            }
            if (await (0, util_1.codeQlVersionAbove)(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING)) {
                // Multilanguage tracing: there are additional logs in the root of the cluster
                toUpload.push(...listFolder(path.resolve(config.dbLocation, "log")));
            }
            await uploadDebugArtifacts(toUpload, config.dbLocation);
            if (!(await (0, util_1.codeQlVersionAbove)(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING))) {
                // Before multi-language tracing, we wrote a compound-build-tracer.log in the temp dir
                await uploadDebugArtifacts([path.resolve(config.tempDir, "compound-build-tracer.log")], config.tempDir);
            }
        }
        if (actionsUtil.getOptionalInput("cleanup-level") !== "none") {
            await (0, analyze_1.runCleanup)(config, actionsUtil.getOptionalInput("cleanup-level") || "brutal", logger);
        }
        const dbLocations = {};
        for (const language of config.languages) {
            dbLocations[language] = util.getCodeQLDatabasePath(config, language);
        }
        core.setOutput("db-locations", dbLocations);
        if (runStats && actionsUtil.getRequiredInput("upload") === "true") {
            uploadStats = await upload_lib.uploadFromActions(outputDir, config.gitHubVersion, apiDetails, logger);
        }
        else {
            logger.info("Not uploading results");
        }
        const repositoryNwo = (0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY"));
        await (0, database_upload_1.uploadDatabases)(repositoryNwo, config, apiDetails, logger); // Possibly upload the database bundles for remote queries
        if (config.debugMode) {
            // Upload the database bundles as an Actions artifact for debugging
            const toUpload = [];
            for (const language of config.languages)
                toUpload.push(await (0, util_1.bundleDb)(config, language, codeql));
            await uploadDebugArtifacts(toUpload, config.dbLocation);
        }
    }
    catch (origError) {
        const error = origError instanceof Error ? origError : new Error(String(origError));
        core.setFailed(error.message);
        console.log(error);
        if (error instanceof analyze_1.CodeQLAnalysisError) {
            const stats = { ...error.queriesStatusReport };
            await sendStatusReport(startedAt, stats, error);
        }
        else {
            await sendStatusReport(startedAt, undefined, error);
        }
        return;
    }
    finally {
        if (core.isDebug() && config !== undefined) {
            core.info("Debug mode is on. Printing CodeQL debug logs...");
            for (const language of config.languages) {
                const databaseDirectory = util.getCodeQLDatabasePath(config, language);
                const logsDirectory = path.join(databaseDirectory, "log");
                const walkLogFiles = (dir) => {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
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
    }
    if (runStats && uploadStats) {
        await sendStatusReport(startedAt, { ...runStats, ...uploadStats });
    }
    else if (runStats) {
        await sendStatusReport(startedAt, { ...runStats });
    }
    else {
        await sendStatusReport(startedAt, undefined);
    }
}
async function uploadDebugArtifacts(toUpload, rootDir) {
    let suffix = "";
    const matrix = actionsUtil.getRequiredInput("matrix");
    if (matrix !== undefined && matrix !== "null") {
        for (const entry of Object.entries(JSON.parse(matrix)).sort())
            suffix += `-${entry[1]}`;
    }
    await artifact.create().uploadArtifact(`${util_1.DEBUG_ARTIFACT_NAME}${suffix}`, toUpload.map((file) => path.normalize(file)), path.normalize(rootDir));
}
function listFolder(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (entry.isFile()) {
            files.push(path.resolve(dir, entry.name));
        }
        else if (entry.isDirectory()) {
            files.push(...listFolder(path.resolve(dir, entry.name)));
        }
    }
    return files;
}
exports.runPromise = run();
async function runWrapper() {
    try {
        await exports.runPromise;
    }
    catch (error) {
        core.setFailed(`analyze action failed: ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=analyze-action.js.map