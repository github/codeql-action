"use strict";
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
exports.run = void 0;
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const feature_flags_1 = require("./feature-flags");
const shared_environment_1 = require("./shared-environment");
const uploadLib = __importStar(require("./upload-lib"));
const util_1 = require("./util");
const workflow_1 = require("./workflow");
async function uploadFailedSarif(config, repositoryNwo, featureEnablement, logger) {
    if (!config.codeQLCmd) {
        logger.warning("CodeQL command not found. Unable to upload failed SARIF file.");
        return;
    }
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    if (!(await featureEnablement.getValue(feature_flags_1.Feature.UploadFailedSarifEnabled, codeql))) {
        logger.debug("Uploading failed SARIF is disabled.");
        return;
    }
    const workflow = await (0, workflow_1.getWorkflow)();
    const jobName = (0, util_1.getRequiredEnvParam)("GITHUB_JOB");
    const matrix = (0, util_1.parseMatrixInput)(actionsUtil.getRequiredInput("matrix"));
    if ((0, workflow_1.getUploadInputOrThrow)(workflow, jobName, matrix) !== "true" ||
        (0, util_1.isInTestMode)()) {
        logger.debug("Won't upload a failed SARIF file since SARIF upload is disabled.");
        return;
    }
    const category = (0, workflow_1.getCategoryInputOrThrow)(workflow, jobName, matrix);
    const checkoutPath = (0, workflow_1.getCheckoutPathInputOrThrow)(workflow, jobName, matrix);
    const waitForProcessing = (0, workflow_1.getWaitForProcessingInputOrThrow)(workflow, jobName, matrix) === "true";
    const sarifFile = "../codeql-failed-run.sarif";
    await codeql.diagnosticsExport(sarifFile, category);
    core.info(`Uploading failed SARIF file ${sarifFile}`);
    const uploadResult = await uploadLib.uploadFromActions(sarifFile, checkoutPath, category, logger);
    if (uploadResult !== undefined && waitForProcessing) {
        try {
            await uploadLib.waitForProcessing(repositoryNwo, uploadResult.sarifID, logger);
        }
        catch (e) {
            if (e instanceof Error && e.message.includes("unsuccessful execution")) {
                logger.info("Submitting a SARIF file for the failed run isn't yet supported, continuing.");
            }
            else {
                throw e;
            }
        }
    }
}
async function run(uploadDatabaseBundleDebugArtifact, uploadLogsDebugArtifact, printDebugLogs, repositoryNwo, featureEnablement, logger) {
    const config = await (0, config_utils_1.getConfig)(actionsUtil.getTemporaryDirectory(), logger);
    if (config === undefined) {
        logger.warning("Debugging artifacts are unavailable since the 'init' Action failed before it could produce any.");
        return;
    }
    // Environment variable used to integration test uploading a SARIF file for failed runs
    const expectFailedSarifUpload = process.env["CODEQL_ACTION_EXPECT_UPLOAD_FAILED_SARIF"] === "true";
    if (process.env[shared_environment_1.CODEQL_ACTION_ANALYZE_DID_UPLOAD_SARIF] !== "true") {
        try {
            await uploadFailedSarif(config, repositoryNwo, featureEnablement, logger);
        }
        catch (e) {
            if (expectFailedSarifUpload) {
                throw new Error("Expected to upload a SARIF file for the failed run, but encountered " +
                    `the following error: ${e}`);
            }
            logger.warning(`Failed to upload a SARIF file for the failed run. Error: ${e}`);
        }
    }
    else if (expectFailedSarifUpload) {
        throw new Error("Expected to upload a SARIF file for the failed run, but didn't.");
    }
    // Upload appropriate Actions artifacts for debugging
    if (config.debugMode) {
        core.info("Debug mode is on. Uploading available database bundles and logs as Actions debugging artifacts...");
        await uploadDatabaseBundleDebugArtifact(config, logger);
        await uploadLogsDebugArtifact(config);
        await printDebugLogs(config);
    }
}
exports.run = run;
//# sourceMappingURL=init-action-post-helper.js.map