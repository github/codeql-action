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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const status_report_1 = require("./status-report");
const upload_lib = __importStar(require("./upload-lib"));
const util_1 = require("./util");
async function sendSuccessStatusReport(startedAt, uploadStats, logger) {
    const statusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.UploadSarif, "success", startedAt, undefined, await (0, util_1.checkDiskUsage)(logger), logger);
    if (statusReportBase !== undefined) {
        const statusReport = {
            ...statusReportBase,
            ...uploadStats,
        };
        await (0, status_report_1.sendStatusReport)(statusReport);
    }
}
async function run() {
    const startedAt = new Date();
    const logger = (0, logging_1.getActionsLogger)();
    (0, util_1.initializeEnvironment)((0, actions_util_1.getActionVersion)());
    const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
    (0, util_1.checkActionVersion)((0, actions_util_1.getActionVersion)(), gitHubVersion);
    // Make inputs accessible in the `post` step.
    actionsUtil.persistInputs();
    const repositoryNwo = (0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY"));
    const features = new feature_flags_1.Features(gitHubVersion, repositoryNwo, (0, actions_util_1.getTemporaryDirectory)(), logger);
    const startingStatusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.UploadSarif, "starting", startedAt, undefined, await (0, util_1.checkDiskUsage)(logger), logger);
    if (startingStatusReportBase !== undefined) {
        await (0, status_report_1.sendStatusReport)(startingStatusReportBase);
    }
    try {
        const uploadResult = await upload_lib.uploadFiles(actionsUtil.getRequiredInput("sarif_file"), actionsUtil.getRequiredInput("checkout_path"), actionsUtil.getOptionalInput("category"), features, logger);
        core.setOutput("sarif-id", uploadResult.sarifID);
        // We don't upload results in test mode, so don't wait for processing
        if ((0, util_1.isInTestMode)()) {
            core.debug("In test mode. Waiting for processing is disabled.");
        }
        else if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
            await upload_lib.waitForProcessing((0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY")), uploadResult.sarifID, logger);
        }
        await sendSuccessStatusReport(startedAt, uploadResult.statusReport, logger);
    }
    catch (unwrappedError) {
        const error = !(0, status_report_1.isFirstPartyAnalysis)(status_report_1.ActionName.UploadSarif) &&
            unwrappedError instanceof upload_lib.InvalidSarifUploadError
            ? new util_1.ConfigurationError(unwrappedError.message)
            : (0, util_1.wrapError)(unwrappedError);
        const message = error.message;
        core.setFailed(message);
        const errorStatusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.UploadSarif, (0, status_report_1.getActionsStatus)(error), startedAt, undefined, await (0, util_1.checkDiskUsage)(logger), logger, message, error.stack);
        if (errorStatusReportBase !== undefined) {
            await (0, status_report_1.sendStatusReport)(errorStatusReportBase);
        }
        return;
    }
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`codeql/upload-sarif action failed: ${(0, util_1.getErrorMessage)(error)}`);
    }
}
void runWrapper();
//# sourceMappingURL=upload-sarif-action.js.map