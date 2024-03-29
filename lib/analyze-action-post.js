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
const analyzeActionPostHelper = __importStar(require("./analyze-action-post-helper"));
const debugArtifacts = __importStar(require("./debug-artifacts"));
const uploadSarifActionPostHelper = __importStar(require("./upload-sarif-action-post-helper"));
const util_1 = require("./util");
async function runWrapper() {
    try {
        await analyzeActionPostHelper.run(debugArtifacts.uploadSarifDebugArtifact);
        // Also run the upload-sarif post action since we're potentially running
        // the same steps in the analyze action.
        await uploadSarifActionPostHelper.uploadArtifacts(debugArtifacts.uploadDebugArtifacts);
    }
    catch (error) {
        core.setFailed(`analyze post-action step failed: ${(0, util_1.wrapError)(error).message}`);
    }
}
void runWrapper();
//# sourceMappingURL=analyze-action-post.js.map