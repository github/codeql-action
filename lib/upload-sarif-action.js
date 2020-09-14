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
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
async function sendSuccessStatusReport(startedAt, uploadStats) {
    const statusReportBase = await util.createStatusReportBase("upload-sarif", "success", startedAt);
    const statusReport = {
        ...statusReportBase,
        ...uploadStats,
    };
    await util.sendStatusReport(statusReport);
}
async function run() {
    const startedAt = new Date();
    if (!(await util.sendStatusReport(await util.createStatusReportBase("upload-sarif", "starting", startedAt), true))) {
        return;
    }
    try {
        const uploadStats = await upload_lib.upload(core.getInput("sarif_file"), repository_1.parseRepositoryNwo(util.getRequiredEnvParam("GITHUB_REPOSITORY")), await util.getCommitOid(), util.getRef(), await util.getAnalysisKey(), util.getRequiredEnvParam("GITHUB_WORKFLOW"), util.getWorkflowRunID(), core.getInput("checkout_path"), core.getInput("matrix"), core.getInput("token"), util.getRequiredEnvParam("GITHUB_SERVER_URL"), "actions", logging_1.getActionsLogger());
        await sendSuccessStatusReport(startedAt, uploadStats);
    }
    catch (error) {
        core.setFailed(error.message);
        console.log(error);
        await util.sendStatusReport(await util.createStatusReportBase("upload-sarif", "failure", startedAt, error.message, error.stack));
        return;
    }
}
run().catch((e) => {
    core.setFailed(`codeql/upload-sarif action failed: ${e}`);
    console.log(e);
});
//# sourceMappingURL=upload-sarif-action.js.map