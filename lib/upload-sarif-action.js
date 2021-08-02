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
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const logging_1 = require("./logging");
const upload_lib = __importStar(require("./upload-lib"));
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendSuccessStatusReport(startedAt, uploadStats) {
    const statusReportBase = await actionsUtil.createStatusReportBase("upload-sarif", "success", startedAt);
    const statusReport = {
        ...statusReportBase,
        ...uploadStats,
    };
    await actionsUtil.sendStatusReport(statusReport);
}
async function run() {
    util_1.initializeEnvironment(util_1.Mode.actions, pkg.version);
    const startedAt = new Date();
    if (!(await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("upload-sarif", "starting", startedAt)))) {
        return;
    }
    try {
        const apiDetails = {
            auth: actionsUtil.getRequiredInput("token"),
            url: util_1.getRequiredEnvParam("GITHUB_SERVER_URL"),
        };
        const gitHubVersion = await util_1.getGitHubVersion(apiDetails);
        const uploadStats = await upload_lib.uploadFromActions(actionsUtil.getRequiredInput("sarif_file"), gitHubVersion, apiDetails, logging_1.getActionsLogger());
        await sendSuccessStatusReport(startedAt, uploadStats);
    }
    catch (error) {
        core.setFailed(error.message);
        console.log(error);
        await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("upload-sarif", "failure", startedAt, error.message, error.stack));
        return;
    }
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`codeql/upload-sarif action failed: ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=upload-sarif-action.js.map