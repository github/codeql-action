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
const repository_1 = require("./repository");
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
    const startedAt = new Date();
    (0, util_1.initializeEnvironment)(pkg.version);
    await (0, util_1.checkActionVersion)(pkg.version);
    if (!(await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("upload-sarif", "starting", startedAt)))) {
        return;
    }
    try {
        const uploadResult = await upload_lib.uploadFromActions(actionsUtil.getRequiredInput("sarif_file"), actionsUtil.getRequiredInput("checkout_path"), actionsUtil.getOptionalInput("category"), (0, logging_1.getActionsLogger)());
        core.setOutput("sarif-id", uploadResult.sarifID);
        // We don't upload results in test mode, so don't wait for processing
        if ((0, util_1.isInTestMode)()) {
            core.debug("In test mode. Waiting for processing is disabled.");
        }
        else if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
            await upload_lib.waitForProcessing((0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY")), uploadResult.sarifID, (0, logging_1.getActionsLogger)());
        }
        await sendSuccessStatusReport(startedAt, uploadResult.statusReport);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : String(error);
        core.setFailed(message);
        console.log(error);
        await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("upload-sarif", actionsUtil.getActionsStatus(error), startedAt, message, stack));
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