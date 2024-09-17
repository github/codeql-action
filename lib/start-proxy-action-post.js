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
const artifact = __importStar(require("@actions/artifact"));
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const configUtils = __importStar(require("./config-utils"));
const util_1 = require("./util");
async function runWrapper() {
    try {
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
        try {
            await artifact
                .create()
                .uploadArtifact("proxy-log-file", [logFilePath], actionsUtil.getTemporaryDirectory(), {
                continueOnError: true,
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