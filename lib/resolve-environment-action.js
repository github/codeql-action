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
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const resolve_environment_1 = require("./resolve-environment");
const status_report_1 = require("./status-report");
const util_1 = require("./util");
const ACTION_NAME = "resolve-environment";
const ENVIRONMENT_OUTPUT_NAME = "environment";
async function run() {
    const startedAt = new Date();
    const logger = (0, logging_1.getActionsLogger)();
    const language = (0, languages_1.resolveAlias)((0, actions_util_1.getRequiredInput)("language"));
    try {
        if (!(await (0, status_report_1.sendStatusReport)(await (0, status_report_1.createStatusReportBase)(ACTION_NAME, "starting", startedAt, await (0, util_1.checkDiskUsage)(logger))))) {
            return;
        }
        const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
        (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger);
        const config = await configUtils.getConfig((0, actions_util_1.getTemporaryDirectory)(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        const workingDirectory = (0, actions_util_1.getOptionalInput)("working-directory");
        const result = await (0, resolve_environment_1.runResolveBuildEnvironment)(config.codeQLCmd, logger, workingDirectory, language);
        core.setOutput(ENVIRONMENT_OUTPUT_NAME, result);
    }
    catch (unwrappedError) {
        const error = (0, util_1.wrapError)(unwrappedError);
        if (error instanceof codeql_1.CommandInvocationError) {
            // If the CLI failed to run successfully for whatever reason,
            // we just return an empty JSON object and proceed with the workflow.
            core.setOutput(ENVIRONMENT_OUTPUT_NAME, {});
            logger.warning(`Failed to resolve a build environment suitable for automatically building your code. ${error.message}`);
        }
        else {
            // For any other error types, something has more seriously gone wrong and we fail.
            core.setFailed(`Failed to resolve a build environment suitable for automatically building your code. ${error.message}`);
            await (0, status_report_1.sendStatusReport)(await (0, status_report_1.createStatusReportBase)(ACTION_NAME, (0, status_report_1.getActionsStatus)(error), startedAt, await (0, util_1.checkDiskUsage)(), error.message, error.stack));
        }
        return;
    }
    await (0, status_report_1.sendStatusReport)(await (0, status_report_1.createStatusReportBase)(ACTION_NAME, "success", startedAt, await (0, util_1.checkDiskUsage)()));
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`${ACTION_NAME} action failed: ${(0, util_1.wrapError)(error).message}`);
    }
    await (0, util_1.checkForTimeout)();
}
void runWrapper();
//# sourceMappingURL=resolve-environment-action.js.map