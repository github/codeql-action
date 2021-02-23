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
const logging_1 = require("./logging");
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
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
    let stats = undefined;
    let config = undefined;
    try {
        actionsUtil.prepareLocalRunEnvironment();
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
            url: actionsUtil.getRequiredEnvParam("GITHUB_SERVER_URL"),
        };
        const outputDir = actionsUtil.getRequiredInput("output");
        const queriesStats = await analyze_1.runAnalyze(outputDir, util.getMemoryFlag(actionsUtil.getOptionalInput("ram")), util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")), util.getThreadsFlag(actionsUtil.getOptionalInput("threads"), logger), config, logger);
        if (actionsUtil.getRequiredInput("upload") === "true") {
            const uploadStats = await upload_lib.uploadFromActions(outputDir, config.gitHubVersion, apiDetails, logger);
            stats = { ...queriesStats, ...uploadStats };
        }
        else {
            logger.info("Not uploading results");
            stats = { ...queriesStats };
        }
    }
    catch (error) {
        core.setFailed(error.message);
        console.log(error);
        if (error instanceof analyze_1.CodeQLAnalysisError) {
            stats = { ...error.queriesStatusReport };
        }
        await sendStatusReport(startedAt, stats, error);
        return;
    }
    finally {
        if (core.isDebug() && config !== undefined) {
            core.info("Debug mode is on. Printing CodeQL debug logs...");
            for (const language of config.languages) {
                const databaseDirectory = util.getCodeQLDatabasePath(config.tempDir, language);
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
    await sendStatusReport(startedAt, stats);
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