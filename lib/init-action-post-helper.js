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
exports.run = exports.tryUploadSarifIfRunFailed = void 0;
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const feature_flags_1 = require("./feature-flags");
const shared_environment_1 = require("./shared-environment");
const uploadLib = __importStar(require("./upload-lib"));
const util_1 = require("./util");
const workflow_1 = require("./workflow");
function createFailedUploadFailedSarifResult(error) {
    return {
        upload_failed_run_error: error instanceof Error ? error.message : String(error),
        upload_failed_run_stack_trace: error instanceof Error ? error.stack : undefined,
    };
}
/**
 * Upload a failed SARIF file if we can verify that SARIF upload is enabled and determine the SARIF
 * category for the workflow.
 */
async function maybeUploadFailedSarif(config, repositoryNwo, featureEnablement, logger) {
    var _a;
    if (!config.codeQLCmd) {
        return { upload_failed_run_skipped_because: "CodeQL command not found" };
    }
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    if (!(await featureEnablement.getValue(feature_flags_1.Feature.UploadFailedSarifEnabled, codeql))) {
        return { upload_failed_run_skipped_because: "Feature disabled" };
    }
    const workflow = await (0, workflow_1.getWorkflow)();
    const jobName = (0, util_1.getRequiredEnvParam)("GITHUB_JOB");
    const matrix = (0, util_1.parseMatrixInput)(actionsUtil.getRequiredInput("matrix"));
    if ((0, workflow_1.getUploadInputOrThrow)(workflow, jobName, matrix) !== "true" ||
        (0, util_1.isInTestMode)()) {
        return { upload_failed_run_skipped_because: "SARIF upload is disabled" };
    }
    const category = (0, workflow_1.getCategoryInputOrThrow)(workflow, jobName, matrix);
    const checkoutPath = (0, workflow_1.getCheckoutPathInputOrThrow)(workflow, jobName, matrix);
    const sarifFile = "../codeql-failed-run.sarif";
    await codeql.diagnosticsExport(sarifFile, category);
    core.info(`Uploading failed SARIF file ${sarifFile}`);
    const uploadResult = await uploadLib.uploadFromActions(sarifFile, checkoutPath, category, logger);
    await uploadLib.waitForProcessing(repositoryNwo, uploadResult.sarifID, logger, { isUnsuccessfulExecution: true });
    return (_a = uploadResult === null || uploadResult === void 0 ? void 0 : uploadResult.statusReport) !== null && _a !== void 0 ? _a : {};
}
async function tryUploadSarifIfRunFailed(config, repositoryNwo, featureEnablement, logger) {
    if (process.env[shared_environment_1.CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY] !== "true") {
        try {
            return await maybeUploadFailedSarif(config, repositoryNwo, featureEnablement, logger);
        }
        catch (e) {
            logger.debug(`Failed to upload a SARIF file for this failed CodeQL code scanning run. ${e}`);
            return createFailedUploadFailedSarifResult(e);
        }
    }
    else {
        return {
            upload_failed_run_skipped_because: "Analyze Action completed successfully",
        };
    }
}
exports.tryUploadSarifIfRunFailed = tryUploadSarifIfRunFailed;
async function run(uploadDatabaseBundleDebugArtifact, uploadLogsDebugArtifact, printDebugLogs, repositoryNwo, featureEnablement, logger) {
    const config = await (0, config_utils_1.getConfig)(actionsUtil.getTemporaryDirectory(), logger);
    if (config === undefined) {
        logger.warning("Debugging artifacts are unavailable since the 'init' Action failed before it could produce any.");
        return;
    }
    const uploadFailedSarifResult = await tryUploadSarifIfRunFailed(config, repositoryNwo, featureEnablement, logger);
    if (uploadFailedSarifResult.upload_failed_run_skipped_because) {
        logger.debug("Won't upload a failed SARIF file for this CodeQL code scanning run because: " +
            `${uploadFailedSarifResult.upload_failed_run_skipped_because}.`);
    }
    // Throw an error if in integration tests, we expected to upload a SARIF file for a failed run
    // but we didn't upload anything.
    if (process.env["CODEQL_ACTION_EXPECT_UPLOAD_FAILED_SARIF"] === "true" &&
        !uploadFailedSarifResult.raw_upload_size_bytes) {
        throw new Error("Expected to upload a failed SARIF file for this CodeQL code scanning run, " +
            `but the result was instead ${uploadFailedSarifResult}.`);
    }
    // Upload appropriate Actions artifacts for debugging
    if (config.debugMode) {
        core.info("Debug mode is on. Uploading available database bundles and logs as Actions debugging artifacts...");
        await uploadDatabaseBundleDebugArtifact(config, logger);
        await uploadLogsDebugArtifact(config);
        await printDebugLogs(config);
    }
    return uploadFailedSarifResult;
}
exports.run = run;
//# sourceMappingURL=init-action-post-helper.js.map