"use strict";
/**
 * This file is the entry point for the `post:` hook of `init-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
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
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const config_utils_1 = require("./config-utils");
const debugArtifacts = __importStar(require("./debug-artifacts"));
const feature_flags_1 = require("./feature-flags");
const initActionPostHelper = __importStar(require("./init-action-post-helper"));
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const status_report_1 = require("./status-report");
const util_1 = require("./util");
async function runWrapper() {
    const logger = (0, logging_1.getActionsLogger)();
    const startedAt = new Date();
    let config;
    let uploadFailedSarifResult;
    try {
        // Restore inputs from `init` Action.
        (0, actions_util_1.restoreInputs)();
        const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
        (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger);
        const repositoryNwo = (0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY"));
        const features = new feature_flags_1.Features(gitHubVersion, repositoryNwo, (0, actions_util_1.getTemporaryDirectory)(), logger);
        config = await (0, config_utils_1.getConfig)((0, actions_util_1.getTemporaryDirectory)(), logger);
        if (config === undefined) {
            logger.warning("Debugging artifacts are unavailable since the 'init' Action failed before it could produce any.");
        }
        else {
            uploadFailedSarifResult = await initActionPostHelper.run(debugArtifacts.tryUploadAllAvailableDebugArtifacts, actions_util_1.printDebugLogs, config, repositoryNwo, features, logger);
        }
    }
    catch (unwrappedError) {
        const error = (0, util_1.wrapError)(unwrappedError);
        core.setFailed(error.message);
        const statusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.InitPost, (0, status_report_1.getActionsStatus)(error), startedAt, config, await (0, util_1.checkDiskUsage)(logger), logger, error.message, error.stack);
        if (statusReportBase !== undefined) {
            await (0, status_report_1.sendStatusReport)(statusReportBase);
        }
        return;
    }
    const jobStatus = initActionPostHelper.getFinalJobStatus();
    logger.info(`CodeQL job status was ${(0, status_report_1.getJobStatusDisplayName)(jobStatus)}.`);
    const statusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.InitPost, "success", startedAt, config, await (0, util_1.checkDiskUsage)(logger), logger);
    if (statusReportBase !== undefined) {
        const statusReport = {
            ...statusReportBase,
            ...uploadFailedSarifResult,
            job_status: initActionPostHelper.getFinalJobStatus(),
        };
        await (0, status_report_1.sendStatusReport)(statusReport);
    }
}
void runWrapper();
//# sourceMappingURL=init-action-post.js.map