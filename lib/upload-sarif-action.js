"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
const actions_util_1 = require("./actions-util");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const status_report_1 = require("./status-report");
const upload_lib = __importStar(require("./upload-lib"));
const util_1 = require("./util");
async function sendSuccessStatusReport(startedAt, uploadStats) {
    const statusReportBase = await (0, status_report_1.createStatusReportBase)("upload-sarif", "success", startedAt, await (0, util_1.checkDiskUsage)());
    const statusReport = {
        ...statusReportBase,
        ...uploadStats,
    };
    await (0, status_report_1.sendStatusReport)(statusReport);
}
async function run() {
    const startedAt = new Date();
    const logger = (0, logging_1.getActionsLogger)();
    (0, util_1.initializeEnvironment)((0, actions_util_1.getActionVersion)());
    if (!(await (0, status_report_1.sendStatusReport)(await (0, status_report_1.createStatusReportBase)("upload-sarif", "starting", startedAt, await (0, util_1.checkDiskUsage)())))) {
        return;
    }
    try {
        const uploadResult = await upload_lib.uploadFromActions(actionsUtil.getRequiredInput("sarif_file"), actionsUtil.getRequiredInput("checkout_path"), actionsUtil.getOptionalInput("category"), logger);
        core.setOutput("sarif-id", uploadResult.sarifID);
        // We don't upload results in test mode, so don't wait for processing
        if ((0, util_1.isInTestMode)()) {
            core.debug("In test mode. Waiting for processing is disabled.");
        }
        else if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
            await upload_lib.waitForProcessing((0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY")), uploadResult.sarifID, logger);
        }
        await sendSuccessStatusReport(startedAt, uploadResult.statusReport);
    }
    catch (unwrappedError) {
        const error = (0, util_1.wrapError)(unwrappedError);
        const message = error.message;
        core.setFailed(message);
        console.log(error);
        await (0, status_report_1.sendStatusReport)(await (0, status_report_1.createStatusReportBase)("upload-sarif", (0, status_report_1.getActionsStatus)(error), startedAt, await (0, util_1.checkDiskUsage)(), message, error.stack));
        return;
    }
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`codeql/upload-sarif action failed: ${(0, util_1.wrapError)(error).message}`);
    }
}
void runWrapper();
//# sourceMappingURL=upload-sarif-action.js.map