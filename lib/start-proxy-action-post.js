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
/**
 * This file is the entry point for the `post:` hook of `start-proxy-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const api_client_1 = require("./api-client");
const configUtils = __importStar(require("./config-utils"));
const debug_artifacts_1 = require("./debug-artifacts");
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const util_1 = require("./util");
async function runWrapper() {
    try {
        // Restore inputs from `start-proxy` Action.
        actionsUtil.restoreInputs();
        const pid = core.getState("proxy-process-pid");
        if (pid) {
            process.kill(Number(pid));
        }
    }
    catch (error) {
        core.setFailed(`start-proxy post-action step failed: ${(0, util_1.getErrorMessage)(error)}`);
    }
    const config = await configUtils.getConfig(actionsUtil.getTemporaryDirectory(), core);
    if ((config && config.debugMode) || core.isDebug()) {
        const logFilePath = core.getState("proxy-log-file");
        core.info("Debug mode is on. Uploading proxy log as Actions debugging artifact...");
        if (config?.gitHubVersion.type === undefined) {
            core.warning(`Did not upload debug artifacts because cannot determine the GitHub variant running.`);
            return;
        }
        const logger = (0, logging_1.getActionsLogger)();
        const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
        (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger);
        const repositoryNwo = (0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY"));
        const features = new feature_flags_1.Features(gitHubVersion, repositoryNwo, actionsUtil.getTemporaryDirectory(), logger);
        try {
            const artifactUploader = await (0, debug_artifacts_1.getArtifactUploaderClient)(logger, gitHubVersion.type, features);
            await artifactUploader.uploadArtifact("proxy-log-file", [logFilePath], actionsUtil.getTemporaryDirectory(), {
                // ensure we don't keep the debug artifacts around for too long since they can be large.
                retentionDays: 7,
            });
        }
        catch (e) {
            // A failure to upload debug artifacts should not fail the entire action.
            core.warning(`Failed to upload debug artifacts: ${e}`);
        }
    }
}
void runWrapper();
//# sourceMappingURL=start-proxy-action-post.js.map