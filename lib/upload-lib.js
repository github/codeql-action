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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidSarifUploadError = void 0;
exports.shouldShowCombineSarifFilesDeprecationWarning = shouldShowCombineSarifFilesDeprecationWarning;
exports.populateRunAutomationDetails = populateRunAutomationDetails;
exports.findSarifFilesInDir = findSarifFilesInDir;
exports.validateSarifFileSchema = validateSarifFileSchema;
exports.buildPayload = buildPayload;
exports.uploadFiles = uploadFiles;
exports.waitForProcessing = waitForProcessing;
exports.validateUniqueCategory = validateUniqueCategory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const core = __importStar(require("@actions/core"));
const file_url_1 = __importDefault(require("file-url"));
const jsonschema = __importStar(require("jsonschema"));
const semver = __importStar(require("semver"));
const actionsUtil = __importStar(require("./actions-util"));
const actions_util_1 = require("./actions-util");
const api = __importStar(require("./api-client"));
const api_client_1 = require("./api-client");
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const diff_filtering_utils_1 = require("./diff-filtering-utils");
const environment_1 = require("./environment");
const fingerprints = __importStar(require("./fingerprints"));
const gitUtils = __importStar(require("./git-utils"));
const init_1 = require("./init");
const repository_1 = require("./repository");
const tools_features_1 = require("./tools-features");
const util = __importStar(require("./util"));
const util_1 = require("./util");
const GENERIC_403_MSG = "The repo on which this action is running has not opted-in to CodeQL code scanning.";
const GENERIC_404_MSG = "The CodeQL code scanning feature is forbidden on this repository.";
// Takes a list of paths to sarif files and combines them together,
// returning the contents of the combined sarif file.
function combineSarifFiles(sarifFiles, logger) {
    logger.info(`Loading SARIF file(s)`);
    const combinedSarif = {
        version: null,
        runs: [],
    };
    for (const sarifFile of sarifFiles) {
        logger.debug(`Loading SARIF file: ${sarifFile}`);
        const sarifObject = JSON.parse(fs.readFileSync(sarifFile, "utf8"));
        // Check SARIF version
        if (combinedSarif.version === null) {
            combinedSarif.version = sarifObject.version;
        }
        else if (combinedSarif.version !== sarifObject.version) {
            throw new InvalidSarifUploadError(`Different SARIF versions encountered: ${combinedSarif.version} and ${sarifObject.version}`);
        }
        combinedSarif.runs.push(...sarifObject.runs);
    }
    return combinedSarif;
}
/**
 * Checks whether all the runs in the given SARIF files were produced by CodeQL.
 * @param sarifObjects The list of SARIF objects to check.
 */
function areAllRunsProducedByCodeQL(sarifObjects) {
    return sarifObjects.every((sarifObject) => {
        return sarifObject.runs?.every((run) => run.tool?.driver?.name === "CodeQL");
    });
}
function createRunKey(run) {
    return {
        name: run.tool?.driver?.name,
        fullName: run.tool?.driver?.fullName,
        version: run.tool?.driver?.version,
        semanticVersion: run.tool?.driver?.semanticVersion,
        guid: run.tool?.driver?.guid,
        automationId: run.automationDetails?.id,
    };
}
/**
 * Checks whether all runs in the given SARIF files are unique (based on the
 * criteria used by Code Scanning to determine analysis categories).
 * @param sarifObjects The list of SARIF objects to check.
 */
function areAllRunsUnique(sarifObjects) {
    const keys = new Set();
    for (const sarifObject of sarifObjects) {
        for (const run of sarifObject.runs) {
            const key = JSON.stringify(createRunKey(run));
            // If the key already exists, the runs are not unique.
            if (keys.has(key)) {
                return false;
            }
            keys.add(key);
        }
    }
    return true;
}
// Checks whether the deprecation warning for combining SARIF files should be shown.
async function shouldShowCombineSarifFilesDeprecationWarning(sarifObjects, githubVersion) {
    // Do not show this warning on GHES versions before 3.14.0
    if (githubVersion.type === util_1.GitHubVariant.GHES &&
        semver.lt(githubVersion.version, "3.14.0")) {
        return false;
    }
    // Only give a deprecation warning when not all runs are unique and
    // we haven't already shown the warning.
    return (!areAllRunsUnique(sarifObjects) &&
        !process.env.CODEQL_MERGE_SARIF_DEPRECATION_WARNING);
}
// Takes a list of paths to sarif files and combines them together using the
// CLI `github merge-results` command when all SARIF files are produced by
// CodeQL. Otherwise, it will fall back to combining the files in the action.
// Returns the contents of the combined sarif file.
async function combineSarifFilesUsingCLI(sarifFiles, gitHubVersion, features, logger) {
    logger.info("Combining SARIF files using the CodeQL CLI");
    if (sarifFiles.length === 1) {
        return JSON.parse(fs.readFileSync(sarifFiles[0], "utf8"));
    }
    const sarifObjects = sarifFiles.map((sarifFile) => {
        return JSON.parse(fs.readFileSync(sarifFile, "utf8"));
    });
    const deprecationWarningMessage = gitHubVersion.type === util_1.GitHubVariant.GHES
        ? "and will be removed in GitHub Enterprise Server 3.18"
        : "and will be removed on June 4, 2025";
    const deprecationMoreInformationMessage = "For more information, see https://github.blog/changelog/2024-05-06-code-scanning-will-stop-combining-runs-from-a-single-upload";
    if (!areAllRunsProducedByCodeQL(sarifObjects)) {
        logger.debug("Not all SARIF files were produced by CodeQL. Merging files in the action.");
        if (await shouldShowCombineSarifFilesDeprecationWarning(sarifObjects, gitHubVersion)) {
            logger.warning(`Uploading multiple SARIF runs with the same category is deprecated ${deprecationWarningMessage}. Please update your workflow to upload a single run per category. ${deprecationMoreInformationMessage}`);
            core.exportVariable("CODEQL_MERGE_SARIF_DEPRECATION_WARNING", "true");
        }
        // If not, use the naive method of combining the files.
        return combineSarifFiles(sarifFiles, logger);
    }
    // Initialize CodeQL, either by using the config file from the 'init' step,
    // or by initializing it here.
    let codeQL;
    let tempDir = actionsUtil.getTemporaryDirectory();
    const config = await (0, config_utils_1.getConfig)(tempDir, logger);
    if (config !== undefined) {
        codeQL = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
        tempDir = config.tempDir;
    }
    else {
        logger.info("Initializing CodeQL since the 'init' Action was not called before this step.");
        const apiDetails = {
            auth: (0, actions_util_1.getRequiredInput)("token"),
            externalRepoAuth: (0, actions_util_1.getOptionalInput)("external-repository-token"),
            url: (0, util_1.getRequiredEnvParam)("GITHUB_SERVER_URL"),
            apiURL: (0, util_1.getRequiredEnvParam)("GITHUB_API_URL"),
        };
        const codeQLDefaultVersionInfo = await features.getDefaultCliVersion(gitHubVersion.type);
        const initCodeQLResult = await (0, init_1.initCodeQL)(undefined, // There is no tools input on the upload action
        apiDetails, tempDir, gitHubVersion.type, codeQLDefaultVersionInfo, features, logger);
        codeQL = initCodeQLResult.codeql;
    }
    if (!(await codeQL.supportsFeature(tools_features_1.ToolsFeature.SarifMergeRunsFromEqualCategory))) {
        logger.warning("The CodeQL CLI does not support merging SARIF files. Merging files in the action.");
        if (await shouldShowCombineSarifFilesDeprecationWarning(sarifObjects, gitHubVersion)) {
            logger.warning(`Uploading multiple CodeQL runs with the same category is deprecated ${deprecationWarningMessage} for CodeQL CLI 2.16.6 and earlier. Please update your CodeQL CLI version or update your workflow to set a distinct category for each CodeQL run. ${deprecationMoreInformationMessage}`);
            core.exportVariable("CODEQL_MERGE_SARIF_DEPRECATION_WARNING", "true");
        }
        return combineSarifFiles(sarifFiles, logger);
    }
    const baseTempDir = path.resolve(tempDir, "combined-sarif");
    fs.mkdirSync(baseTempDir, { recursive: true });
    const outputDirectory = fs.mkdtempSync(path.resolve(baseTempDir, "output-"));
    const outputFile = path.resolve(outputDirectory, "combined-sarif.sarif");
    await codeQL.mergeResults(sarifFiles, outputFile, {
        mergeRunsFromEqualCategory: true,
    });
    return JSON.parse(fs.readFileSync(outputFile, "utf8"));
}
// Populates the run.automationDetails.id field using the analysis_key and environment
// and return an updated sarif file contents.
function populateRunAutomationDetails(sarif, category, analysis_key, environment) {
    const automationID = getAutomationID(category, analysis_key, environment);
    if (automationID !== undefined) {
        for (const run of sarif.runs || []) {
            if (run.automationDetails === undefined) {
                run.automationDetails = {
                    id: automationID,
                };
            }
        }
        return sarif;
    }
    return sarif;
}
function getAutomationID(category, analysis_key, environment) {
    if (category !== undefined) {
        let automationID = category;
        if (!automationID.endsWith("/")) {
            automationID += "/";
        }
        return automationID;
    }
    return api.computeAutomationID(analysis_key, environment);
}
// Upload the given payload.
// If the request fails then this will retry a small number of times.
async function uploadPayload(payload, repositoryNwo, logger) {
    logger.info("Uploading results");
    // If in test mode we don't want to upload the results
    if (util.isInTestMode()) {
        const payloadSaveFile = path.join(actionsUtil.getTemporaryDirectory(), "payload.json");
        logger.info(`In test mode. Results are not uploaded. Saving to ${payloadSaveFile}`);
        logger.info(`Payload: ${JSON.stringify(payload, null, 2)}`);
        fs.writeFileSync(payloadSaveFile, JSON.stringify(payload, null, 2));
        return "test-mode-sarif-id";
    }
    const client = api.getApiClient();
    try {
        const response = await client.request("PUT /repos/:owner/:repo/code-scanning/analysis", {
            owner: repositoryNwo.owner,
            repo: repositoryNwo.repo,
            data: payload,
        });
        logger.debug(`response status: ${response.status}`);
        logger.info("Successfully uploaded results");
        return response.data.id;
    }
    catch (e) {
        if (util.isHTTPError(e)) {
            switch (e.status) {
                case 403:
                    core.warning(e.message || GENERIC_403_MSG);
                    break;
                case 404:
                    core.warning(e.message || GENERIC_404_MSG);
                    break;
                default:
                    core.warning(e.message);
                    break;
            }
        }
        throw (0, api_client_1.wrapApiConfigurationError)(e);
    }
}
// Recursively walks a directory and returns all SARIF files it finds.
// Does not follow symlinks.
function findSarifFilesInDir(sarifPath) {
    const sarifFiles = [];
    const walkSarifFiles = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".sarif")) {
                sarifFiles.push(path.resolve(dir, entry.name));
            }
            else if (entry.isDirectory()) {
                walkSarifFiles(path.resolve(dir, entry.name));
            }
        }
    };
    walkSarifFiles(sarifPath);
    return sarifFiles;
}
function getSarifFilePaths(sarifPath) {
    if (!fs.existsSync(sarifPath)) {
        // This is always a configuration error, even for first-party runs.
        throw new util_1.ConfigurationError(`Path does not exist: ${sarifPath}`);
    }
    let sarifFiles;
    if (fs.lstatSync(sarifPath).isDirectory()) {
        sarifFiles = findSarifFilesInDir(sarifPath);
        if (sarifFiles.length === 0) {
            // This is always a configuration error, even for first-party runs.
            throw new util_1.ConfigurationError(`No SARIF files found to upload in "${sarifPath}".`);
        }
    }
    else {
        sarifFiles = [sarifPath];
    }
    return sarifFiles;
}
// Counts the number of results in the given SARIF file
function countResultsInSarif(sarif) {
    let numResults = 0;
    const parsedSarif = JSON.parse(sarif);
    if (!Array.isArray(parsedSarif.runs)) {
        throw new InvalidSarifUploadError("Invalid SARIF. Missing 'runs' array.");
    }
    for (const run of parsedSarif.runs) {
        if (!Array.isArray(run.results)) {
            throw new InvalidSarifUploadError("Invalid SARIF. Missing 'results' array in run.");
        }
        numResults += run.results.length;
    }
    return numResults;
}
// Validates that the given file path refers to a valid SARIF file.
// Throws an error if the file is invalid.
function validateSarifFileSchema(sarifFilePath, logger) {
    logger.info(`Validating ${sarifFilePath}`);
    let sarif;
    try {
        sarif = JSON.parse(fs.readFileSync(sarifFilePath, "utf8"));
    }
    catch (e) {
        throw new InvalidSarifUploadError(`Invalid SARIF. JSON syntax error: ${(0, util_1.getErrorMessage)(e)}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const schema = require("../src/sarif-schema-2.1.0.json");
    const result = new jsonschema.Validator().validate(sarif, schema);
    // Filter errors related to invalid URIs in the artifactLocation field as this
    // is a breaking change. See https://github.com/github/codeql-action/issues/1703
    const warningAttributes = ["uri-reference", "uri"];
    const errors = (result.errors ?? []).filter((err) => !(err.name === "format" &&
        typeof err.argument === "string" &&
        warningAttributes.includes(err.argument)));
    const warnings = (result.errors ?? []).filter((err) => err.name === "format" &&
        typeof err.argument === "string" &&
        warningAttributes.includes(err.argument));
    for (const warning of warnings) {
        logger.info(`Warning: '${warning.instance}' is not a valid URI in '${warning.property}'.`);
    }
    if (errors.length) {
        // Output the more verbose error messages in groups as these may be very large.
        for (const error of errors) {
            logger.startGroup(`Error details: ${error.stack}`);
            logger.info(JSON.stringify(error, null, 2));
            logger.endGroup();
        }
        // Set the main error message to the stacks of all the errors.
        // This should be of a manageable size and may even give enough to fix the error.
        const sarifErrors = errors.map((e) => `- ${e.stack}`);
        throw new InvalidSarifUploadError(`Unable to upload "${sarifFilePath}" as it is not valid SARIF:\n${sarifErrors.join("\n")}`);
    }
}
// buildPayload constructs a map ready to be uploaded to the API from the given
// parameters, respecting the current mode and target GitHub instance version.
function buildPayload(commitOid, ref, analysisKey, analysisName, zippedSarif, workflowRunID, workflowRunAttempt, checkoutURI, environment, toolNames, mergeBaseCommitOid) {
    const payloadObj = {
        commit_oid: commitOid,
        ref,
        analysis_key: analysisKey,
        analysis_name: analysisName,
        sarif: zippedSarif,
        workflow_run_id: workflowRunID,
        workflow_run_attempt: workflowRunAttempt,
        checkout_uri: checkoutURI,
        environment,
        started_at: process.env[environment_1.EnvVar.WORKFLOW_STARTED_AT],
        tool_names: toolNames,
        base_ref: undefined,
        base_sha: undefined,
    };
    if (actionsUtil.getWorkflowEventName() === "pull_request") {
        if (commitOid === util.getRequiredEnvParam("GITHUB_SHA") &&
            mergeBaseCommitOid) {
            // We're uploading results for the merge commit
            // and were able to determine the merge base.
            // So we use that as the most accurate base.
            payloadObj.base_ref = `refs/heads/${util.getRequiredEnvParam("GITHUB_BASE_REF")}`;
            payloadObj.base_sha = mergeBaseCommitOid;
        }
        else if (process.env.GITHUB_EVENT_PATH) {
            // Either we're not uploading results for the merge commit
            // or we could not determine the merge base.
            // Using the PR base is the only option here
            const githubEvent = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
            payloadObj.base_ref = `refs/heads/${githubEvent.pull_request.base.ref}`;
            payloadObj.base_sha = githubEvent.pull_request.base.sha;
        }
    }
    return payloadObj;
}
/**
 * Uploads a single SARIF file or a directory of SARIF files depending on what `sarifPath` refers
 * to.
 */
async function uploadFiles(sarifPath, checkoutPath, category, features, logger) {
    const sarifFiles = getSarifFilePaths(sarifPath);
    logger.startGroup("Uploading results");
    logger.info(`Processing sarif files: ${JSON.stringify(sarifFiles)}`);
    const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
    // Validate that the files we were asked to upload are all valid SARIF files
    for (const file of sarifFiles) {
        validateSarifFileSchema(file, logger);
    }
    let sarif = await combineSarifFilesUsingCLI(sarifFiles, gitHubVersion, features, logger);
    sarif = filterAlertsByDiffRange(logger, sarif);
    sarif = await fingerprints.addFingerprints(sarif, checkoutPath, logger);
    const analysisKey = await api.getAnalysisKey();
    const environment = actionsUtil.getRequiredInput("matrix");
    sarif = populateRunAutomationDetails(sarif, category, analysisKey, environment);
    const toolNames = util.getToolNames(sarif);
    logger.debug(`Validating that each SARIF run has a unique category`);
    validateUniqueCategory(sarif);
    logger.debug(`Serializing SARIF for upload`);
    const sarifPayload = JSON.stringify(sarif);
    logger.debug(`Compressing serialized SARIF`);
    const zippedSarif = zlib_1.default.gzipSync(sarifPayload).toString("base64");
    const checkoutURI = (0, file_url_1.default)(checkoutPath);
    const payload = buildPayload(await gitUtils.getCommitOid(checkoutPath), await gitUtils.getRef(), analysisKey, util.getRequiredEnvParam("GITHUB_WORKFLOW"), zippedSarif, actionsUtil.getWorkflowRunID(), actionsUtil.getWorkflowRunAttempt(), checkoutURI, environment, toolNames, await gitUtils.determineBaseBranchHeadCommitOid());
    // Log some useful debug info about the info
    const rawUploadSizeBytes = sarifPayload.length;
    logger.debug(`Raw upload size: ${rawUploadSizeBytes} bytes`);
    const zippedUploadSizeBytes = zippedSarif.length;
    logger.debug(`Base64 zipped upload size: ${zippedUploadSizeBytes} bytes`);
    const numResultInSarif = countResultsInSarif(sarifPayload);
    logger.debug(`Number of results in upload: ${numResultInSarif}`);
    // Make the upload
    const sarifID = await uploadPayload(payload, (0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY")), logger);
    logger.endGroup();
    return {
        statusReport: {
            raw_upload_size_bytes: rawUploadSizeBytes,
            zipped_upload_size_bytes: zippedUploadSizeBytes,
            num_results_in_sarif: numResultInSarif,
        },
        sarifID,
    };
}
const STATUS_CHECK_FREQUENCY_MILLISECONDS = 5 * 1000;
const STATUS_CHECK_TIMEOUT_MILLISECONDS = 2 * 60 * 1000;
/**
 * Waits until either the analysis is successfully processed, a processing error
 * is reported, or `STATUS_CHECK_TIMEOUT_MILLISECONDS` elapses.
 *
 * If `isUnsuccessfulExecution` is passed, will throw an error if the analysis
 * processing does not produce a single error mentioning the unsuccessful
 * execution.
 */
async function waitForProcessing(repositoryNwo, sarifID, logger, options = {
    isUnsuccessfulExecution: false,
}) {
    logger.startGroup("Waiting for processing to finish");
    try {
        const client = api.getApiClient();
        const statusCheckingStarted = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (Date.now() >
                statusCheckingStarted + STATUS_CHECK_TIMEOUT_MILLISECONDS) {
                // If the analysis hasn't finished processing in the allotted time, we continue anyway rather than failing.
                // It's possible the analysis will eventually finish processing, but it's not worth spending more
                // Actions time waiting.
                logger.warning("Timed out waiting for analysis to finish processing. Continuing.");
                break;
            }
            let response = undefined;
            try {
                response = await client.request("GET /repos/:owner/:repo/code-scanning/sarifs/:sarif_id", {
                    owner: repositoryNwo.owner,
                    repo: repositoryNwo.repo,
                    sarif_id: sarifID,
                });
            }
            catch (e) {
                logger.warning(`An error occurred checking the status of the delivery. ${e} It should still be processed in the background, but errors that occur during processing may not be reported.`);
                break;
            }
            const status = response.data.processing_status;
            logger.info(`Analysis upload status is ${status}.`);
            if (status === "pending") {
                logger.debug("Analysis processing is still pending...");
            }
            else if (options.isUnsuccessfulExecution) {
                // We expect a specific processing error for unsuccessful executions, so
                // handle these separately.
                handleProcessingResultForUnsuccessfulExecution(response, status, logger);
                break;
            }
            else if (status === "complete") {
                break;
            }
            else if (status === "failed") {
                const message = `Code Scanning could not process the submitted SARIF file:\n${response.data.errors}`;
                const processingErrors = response.data.errors;
                throw shouldConsiderConfigurationError(processingErrors)
                    ? new util_1.ConfigurationError(message)
                    : shouldConsiderInvalidRequest(processingErrors)
                        ? new InvalidSarifUploadError(message)
                        : new Error(message);
            }
            else {
                util.assertNever(status);
            }
            await util.delay(STATUS_CHECK_FREQUENCY_MILLISECONDS, {
                allowProcessExit: false,
            });
        }
    }
    finally {
        logger.endGroup();
    }
}
/**
 * Returns whether the provided processing errors are a configuration error.
 */
function shouldConsiderConfigurationError(processingErrors) {
    return (processingErrors.length === 1 &&
        processingErrors[0] ===
            "CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled");
}
/**
 * Returns whether the provided processing errors are the result of an invalid SARIF upload request.
 */
function shouldConsiderInvalidRequest(processingErrors) {
    return processingErrors.every((error) => error.startsWith("rejecting SARIF") ||
        error.startsWith("an invalid URI was provided as a SARIF location") ||
        error.startsWith("locationFromSarifResult: expected artifact location") ||
        error.startsWith("could not convert rules: invalid security severity value, is not a number") ||
        /^SARIF URI scheme [^\s]* did not match the checkout URI scheme [^\s]*/.test(error));
}
/**
 * Checks the processing result for an unsuccessful execution. Throws if the
 * result is not a failure with a single "unsuccessful execution" error.
 */
function handleProcessingResultForUnsuccessfulExecution(response, status, logger) {
    if (status === "failed" &&
        Array.isArray(response.data.errors) &&
        response.data.errors.length === 1 &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        response.data.errors[0].toString().startsWith("unsuccessful execution")) {
        logger.debug("Successfully uploaded a SARIF file for the unsuccessful execution. Received expected " +
            '"unsuccessful execution" processing error, and no other errors.');
    }
    else if (status === "failed") {
        logger.warning(`Failed to upload a SARIF file for the unsuccessful execution. Code scanning status ` +
            `information for the repository may be out of date as a result. Processing errors: ${response.data.errors}`);
    }
    else if (status === "complete") {
        // There is a known transient issue with the code scanning API where it sometimes reports
        // `complete` for an unsuccessful execution submission.
        logger.debug("Uploaded a SARIF file for the unsuccessful execution, but did not receive the expected " +
            '"unsuccessful execution" processing error. This is a known transient issue with the ' +
            "code scanning API, and does not cause out of date code scanning status information.");
    }
    else {
        util.assertNever(status);
    }
}
function validateUniqueCategory(sarif) {
    // duplicate categories are allowed in the same sarif file
    // but not across multiple sarif files
    const categories = {};
    for (const run of sarif.runs) {
        const id = run?.automationDetails?.id;
        const tool = run.tool?.driver?.name;
        const category = `${sanitize(id)}_${sanitize(tool)}`;
        categories[category] = { id, tool };
    }
    for (const [category, { id, tool }] of Object.entries(categories)) {
        const sentinelEnvVar = `CODEQL_UPLOAD_SARIF_${category}`;
        if (process.env[sentinelEnvVar]) {
            // This is always a configuration error, even for first-party runs.
            throw new util_1.ConfigurationError("Aborting upload: only one run of the codeql/analyze or codeql/upload-sarif actions is allowed per job per tool/category. " +
                "The easiest fix is to specify a unique value for the `category` input. If .runs[].automationDetails.id is specified " +
                "in the sarif file, that will take precedence over your configured `category`. " +
                `Category: (${id ? id : "none"}) Tool: (${tool ? tool : "none"})`);
        }
        core.exportVariable(sentinelEnvVar, sentinelEnvVar);
    }
}
/**
 * Sanitizes a string to be used as an environment variable name.
 * This will replace all non-alphanumeric characters with underscores.
 * There could still be some false category clashes if two uploads
 * occur that differ only in their non-alphanumeric characters. This is
 * unlikely.
 *
 * @param str the initial value to sanitize
 */
function sanitize(str) {
    return (str ?? "_").replace(/[^a-zA-Z0-9_]/g, "_").toLocaleUpperCase();
}
/**
 * An error that occurred due to an invalid SARIF upload request.
 */
class InvalidSarifUploadError extends Error {
    constructor(message) {
        super(message);
    }
}
exports.InvalidSarifUploadError = InvalidSarifUploadError;
function filterAlertsByDiffRange(logger, sarif) {
    const diffRanges = (0, diff_filtering_utils_1.readDiffRangesJsonFile)(logger);
    if (!diffRanges?.length) {
        return sarif;
    }
    const checkoutPath = actionsUtil.getRequiredInput("checkout_path");
    for (const run of sarif.runs) {
        if (run.results) {
            run.results = run.results.filter((result) => {
                const locations = [
                    ...(result.locations || []).map((loc) => loc.physicalLocation),
                    ...(result.relatedLocations || []).map((loc) => loc.physicalLocation),
                ];
                return locations.some((physicalLocation) => {
                    const locationUri = physicalLocation?.artifactLocation?.uri;
                    const locationStartLine = physicalLocation?.region?.startLine;
                    if (!locationUri || locationStartLine === undefined) {
                        return false;
                    }
                    // CodeQL always uses forward slashes as the path separator, so on Windows we
                    // need to replace any backslashes with forward slashes.
                    const locationPath = path
                        .join(checkoutPath, locationUri)
                        .replaceAll(path.sep, "/");
                    // Alert filtering here replicates the same behavior as the restrictAlertsTo
                    // extensible predicate in CodeQL. See the restrictAlertsTo documentation
                    // https://codeql.github.com/codeql-standard-libraries/csharp/codeql/util/AlertFiltering.qll/predicate.AlertFiltering$restrictAlertsTo.3.html
                    // for more details, such as why the filtering applies only to the first line
                    // of an alert location.
                    return diffRanges.some((range) => range.path === locationPath &&
                        ((range.startLine <= locationStartLine &&
                            range.endLine >= locationStartLine) ||
                            (range.startLine === 0 && range.endLine === 0)));
                });
            });
        }
    }
    return sarif;
}
//# sourceMappingURL=upload-lib.js.map