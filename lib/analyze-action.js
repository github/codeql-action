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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const config_utils_1 = require("./config-utils");
const database_upload_1 = require("./database-upload");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
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
        const logger = logging_1.getActionsLogger();
        config = await config_utils_1.getConfig(actionsUtil.getTemporaryDirectory(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        const apiDetails = {
            auth: actionsUtil.getRequiredInput("token"),
            url: util.getRequiredEnvParam("GITHUB_SERVER_URL"),
        };
        const outputDir = actionsUtil.getRequiredInput("output");
        const threads = util.getThreadsFlag(actionsUtil.getOptionalInput("threads"), logger);
        await analyze_1.runFinalize(outputDir, threads, config, logger);
        if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
            runStats = await analyze_1.runQueries(outputDir, util.getMemoryFlag(actionsUtil.getOptionalInput("ram")), util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")), threads, actionsUtil.getOptionalInput("category"), config, logger);
        }
        if (actionsUtil.getOptionalInput("cleanup-level") !== "none") {
            await analyze_1.runCleanup(config, actionsUtil.getOptionalInput("cleanup-level") || "brutal", logger);
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
        const repositoryNwo = repository_1.parseRepositoryNwo(util.getRequiredEnvParam("GITHUB_REPOSITORY"));
        await database_upload_1.uploadDatabases(repositoryNwo, config, apiDetails, logger);
    }
    catch (error) {
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
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`analyze action failed: ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=analyze-action.js.map