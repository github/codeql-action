"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const glob = __importStar(require("@actions/glob"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const config_utils_1 = require("./config-utils");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
async function sendStatusReport(startedAt, stats, error) {
    var _a, _b, _c;
    const status = ((_a = stats) === null || _a === void 0 ? void 0 : _a.analyze_failure_language) !== undefined || error !== undefined
        ? "failure"
        : "success";
    const statusReportBase = await actionsUtil.createStatusReportBase("finish", status, startedAt, (_b = error) === null || _b === void 0 ? void 0 : _b.message, (_c = error) === null || _c === void 0 ? void 0 : _c.stack);
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
        config = await config_utils_1.getConfig(actionsUtil.getRequiredEnvParam("RUNNER_TEMP"), logger);
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
            const uploadStats = await upload_lib.uploadFromActions(outputDir, repository_1.parseRepositoryNwo(actionsUtil.getRequiredEnvParam("GITHUB_REPOSITORY")), await actionsUtil.getCommitOid(), await actionsUtil.getRef(), await actionsUtil.getAnalysisKey(), actionsUtil.getRequiredEnvParam("GITHUB_WORKFLOW"), actionsUtil.getWorkflowRunID(), actionsUtil.getRequiredInput("checkout_path"), actionsUtil.getRequiredInput("matrix"), config.gitHubVersion, apiDetails, logger);
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
                const logsDirectory = util.getCodeQLDatabasePath(config.tempDir, language);
                const logGlobber = await glob.create(path.join(logsDirectory, "log", "**"));
                const logFiles = await logGlobber.glob();
                for (const logFile of logFiles) {
                    if (fs.statSync(logFile).isFile()) {
                        core.startGroup(`CodeQL Debug Logs - ${language} - ${logFile}`);
                        process.stderr.write(fs.readFileSync(logFile));
                        core.endGroup();
                    }
                }
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