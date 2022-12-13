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
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const debugArtifacts = __importStar(require("./debug-artifacts"));
const feature_flags_1 = require("./feature-flags");
const initActionPostHelper = __importStar(require("./init-action-post-helper"));
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const util_1 = require("./util");
async function runWrapper() {
    const startedAt = new Date();
    let uploadFailedSarifResult;
    try {
        const logger = (0, logging_1.getActionsLogger)();
        const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
        (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger);
        const repositoryNwo = (0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY"));
        const features = new feature_flags_1.Features(gitHubVersion, repositoryNwo, (0, actions_util_1.getTemporaryDirectory)(), logger);
        uploadFailedSarifResult = await initActionPostHelper.run(debugArtifacts.uploadDatabaseBundleDebugArtifact, debugArtifacts.uploadLogsDebugArtifact, actions_util_1.printDebugLogs, repositoryNwo, features, logger);
    }
    catch (e) {
        core.setFailed(e instanceof Error ? e.message : String(e));
        console.log(e);
        await (0, actions_util_1.sendStatusReport)(await (0, actions_util_1.createStatusReportBase)("init-post", (0, actions_util_1.getActionsStatus)(e), startedAt, String(e), e instanceof Error ? e.stack : undefined));
        return;
    }
    const statusReportBase = await (0, actions_util_1.createStatusReportBase)("init-post", "success", startedAt);
    const statusReport = {
        ...statusReportBase,
        ...uploadFailedSarifResult,
    };
    await (0, actions_util_1.sendStatusReport)(statusReport);
}
void runWrapper();
//# sourceMappingURL=init-action-post.js.map