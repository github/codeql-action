"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const config_utils_1 = require("./config-utils");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
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
    try {
        actionsUtil.prepareLocalRunEnvironment();
        if (!(await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("finish", "starting", startedAt), true))) {
            return;
        }
        const logger = logging_1.getActionsLogger();
        const config = await config_utils_1.getConfig(actionsUtil.getRequiredEnvParam("RUNNER_TEMP"), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        stats = await analyze_1.runAnalyze(repository_1.parseRepositoryNwo(actionsUtil.getRequiredEnvParam("GITHUB_REPOSITORY")), await actionsUtil.getCommitOid(), await actionsUtil.getRef(), await actionsUtil.getAnalysisKey(), actionsUtil.getRequiredEnvParam("GITHUB_WORKFLOW"), actionsUtil.getWorkflowRunID(), actionsUtil.getRequiredInput("checkout_path"), actionsUtil.getRequiredInput("matrix"), actionsUtil.getRequiredInput("token"), actionsUtil.getRequiredEnvParam("GITHUB_SERVER_URL"), actionsUtil.getRequiredInput("upload") === "true", "actions", actionsUtil.getRequiredInput("output"), util.getMemoryFlag(actionsUtil.getOptionalInput("ram")), util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")), util.getThreadsFlag(actionsUtil.getOptionalInput("threads"), logger), config, logger);
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
    await sendStatusReport(startedAt, stats);
}
run().catch((e) => {
    core.setFailed(`analyze action failed: ${e}`);
    console.log(e);
});
//# sourceMappingURL=analyze-action.js.map