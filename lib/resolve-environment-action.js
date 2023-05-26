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
const configUtils = __importStar(require("./config-utils"));
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const resolve_environment_1 = require("./resolve-environment");
const util_1 = require("./util");
const workflow_1 = require("./workflow");
const actionName = "resolve-environment";
async function run() {
    const startedAt = new Date();
    const logger = (0, logging_1.getActionsLogger)();
    const language = (0, languages_1.resolveAlias)((0, actions_util_1.getRequiredInput)("language"));
    try {
        const workflowErrors = await (0, workflow_1.validateWorkflow)(logger);
        if (!(await (0, actions_util_1.sendStatusReport)(await (0, actions_util_1.createStatusReportBase)(actionName, "starting", startedAt, workflowErrors)))) {
            return;
        }
        const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
        (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger);
        const config = await configUtils.getConfig((0, actions_util_1.getTemporaryDirectory)(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        const result = await (0, resolve_environment_1.runResolveBuildEnvironment)(config.codeQLCmd, logger, language);
        core.setOutput("configuration", result);
    }
    catch (unwrappedError) {
        const error = (0, util_1.wrapError)(unwrappedError);
        core.setFailed(error.message);
        await (0, actions_util_1.sendStatusReport)(await (0, actions_util_1.createStatusReportBase)(actionName, "aborted", startedAt, error.message, error.stack));
        return;
    }
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`${actionName} action failed: ${(0, util_1.wrapError)(error).message}`);
    }
    await (0, util_1.checkForTimeout)();
}
void runWrapper();
//# sourceMappingURL=resolve-environment-action.js.map