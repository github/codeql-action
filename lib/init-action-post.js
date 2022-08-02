"use strict";
/**
 * This file is the entry point for the `post:` hook of `init-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
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
const config_utils_1 = require("./config-utils");
const debugArtifacts = __importStar(require("./debug-artifacts"));
const logging_1 = require("./logging");
async function run(uploadDatabaseBundleDebugArtifact, uploadLogsDebugArtifact, printDebugLogs) {
    const logger = (0, logging_1.getActionsLogger)();
    const config = await (0, config_utils_1.getConfig)(actionsUtil.getTemporaryDirectory(), logger);
    if (config === undefined) {
        throw new Error("Config file could not be found at expected location. Did the 'init' action fail to start?");
    }
    // Upload appropriate Actions artifacts for debugging
    if (config === null || config === void 0 ? void 0 : config.debugMode) {
        core.info("Debug mode is on. Uploading available database bundles and logs as Actions debugging artifacts...");
        await uploadDatabaseBundleDebugArtifact(config, logger);
        await uploadLogsDebugArtifact(config);
        await printDebugLogs(config);
    }
}
async function runWrapper() {
    try {
        await run(debugArtifacts.uploadDatabaseBundleDebugArtifact, debugArtifacts.uploadLogsDebugArtifact, actionsUtil.printDebugLogs);
    }
    catch (error) {
        core.setFailed(`init action cleanup failed: ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=init-action-post.js.map