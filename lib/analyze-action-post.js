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
 * This file is the entry point for the `post:` hook of `analyze-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
const core = __importStar(require("@actions/core"));
const debugArtifacts = __importStar(require("./debug-artifacts"));
const environment_1 = require("./environment");
const logging_1 = require("./logging");
const util_1 = require("./util");
async function runWrapper() {
    try {
        const logger = (0, logging_1.getActionsLogger)();
        // Upload SARIF artifacts if we determine that this is a first-party analysis run.
        // For third-party runs, this artifact will be uploaded in the `upload-sarif-post` step.
        if (process.env[environment_1.EnvVar.INIT_ACTION_HAS_RUN] === "true") {
            await (0, logging_1.withGroup)("Uploading combined SARIF debug artifact", () => debugArtifacts.uploadCombinedSarifArtifacts(logger));
        }
    }
    catch (error) {
        core.setFailed(`analyze post-action step failed: ${(0, util_1.getErrorMessage)(error)}`);
    }
}
void runWrapper();
//# sourceMappingURL=analyze-action-post.js.map