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
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const upload_lib = __importStar(require("./upload-lib"));
async function sendSuccessStatusReport(startedAt, uploadStats) {
    const statusReportBase = await actionsUtil.createStatusReportBase("upload-sarif", "success", startedAt);
    const statusReport = {
        ...statusReportBase,
        ...uploadStats,
    };
    await actionsUtil.sendStatusReport(statusReport);
}
async function run() {
    const startedAt = new Date();
    if (!(await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("upload-sarif", "starting", startedAt)))) {
        return;
    }
    try {
        const apiDetails = {
            auth: actionsUtil.getRequiredInput("token"),
            url: actionsUtil.getRequiredEnvParam("GITHUB_SERVER_URL"),
        };
        const uploadStats = await upload_lib.upload(actionsUtil.getRequiredInput("sarif_file"), repository_1.parseRepositoryNwo(actionsUtil.getRequiredEnvParam("GITHUB_REPOSITORY")), await actionsUtil.getCommitOid(), await actionsUtil.getRef(), await actionsUtil.getAnalysisKey(), actionsUtil.getRequiredEnvParam("GITHUB_WORKFLOW"), actionsUtil.getWorkflowRunID(), actionsUtil.getRequiredInput("checkout_path"), actionsUtil.getRequiredInput("matrix"), apiDetails, "actions", logging_1.getActionsLogger());
        await sendSuccessStatusReport(startedAt, uploadStats);
    }
    catch (error) {
        core.setFailed(error.message);
        console.log(error);
        await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("upload-sarif", "failure", startedAt, error.message, error.stack));
        return;
    }
}
run().catch((e) => {
    core.setFailed(`codeql/upload-sarif action failed: ${e}`);
    console.log(e);
});
//# sourceMappingURL=upload-sarif-action.js.map