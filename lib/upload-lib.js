"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zlib_1 = __importDefault(require("zlib"));
const core = __importStar(require("@actions/core"));
const file_url_1 = __importDefault(require("file-url"));
const jsonschema = __importStar(require("jsonschema"));
const api = __importStar(require("./api-client"));
const fingerprints = __importStar(require("./fingerprints"));
const sharedEnv = __importStar(require("./shared-environment"));
const util = __importStar(require("./util"));
// Takes a list of paths to sarif files and combines them together,
// returning the contents of the combined sarif file.
function combineSarifFiles(sarifFiles) {
    const combinedSarif = {
        version: null,
        runs: [],
    };
    for (const sarifFile of sarifFiles) {
        const sarifObject = JSON.parse(fs.readFileSync(sarifFile, "utf8"));
        // Check SARIF version
        if (combinedSarif.version === null) {
            combinedSarif.version = sarifObject.version;
        }
        else if (combinedSarif.version !== sarifObject.version) {
            throw new Error(`Different SARIF versions encountered: ${combinedSarif.version} and ${sarifObject.version}`);
        }
        combinedSarif.runs.push(...sarifObject.runs);
    }
    return JSON.stringify(combinedSarif);
}
exports.combineSarifFiles = combineSarifFiles;
// Upload the given payload.
// If the request fails then this will retry a small number of times.
async function uploadPayload(payload, repositoryNwo, githubAuth, githubUrl, mode, logger) {
    logger.info("Uploading results");
    // If in test mode we don't want to upload the results
    const testMode = process.env["TEST_MODE"] === "true" || false;
    if (testMode) {
        return;
    }
    const client = api.getApiClient(githubAuth, githubUrl, mode, logger);
    const reqURL = mode === "actions"
        ? "PUT /repos/:owner/:repo/code-scanning/analysis"
        : "POST /repos/:owner/:repo/code-scanning/sarifs";
    const response = await client.request(reqURL, {
        owner: repositoryNwo.owner,
        repo: repositoryNwo.repo,
        data: payload,
    });
    logger.debug(`response status: ${response.status}`);
    logger.info("Successfully uploaded results");
}
// Uploads a single sarif file or a directory of sarif files
// depending on what the path happens to refer to.
// Returns true iff the upload occurred and succeeded
async function upload(sarifPath, repositoryNwo, commitOid, ref, analysisKey, analysisName, workflowRunID, checkoutPath, environment, githubAuth, githubUrl, mode, logger) {
    const sarifFiles = [];
    if (!fs.existsSync(sarifPath)) {
        throw new Error(`Path does not exist: ${sarifPath}`);
    }
    if (fs.lstatSync(sarifPath).isDirectory()) {
        const paths = fs
            .readdirSync(sarifPath)
            .filter((f) => f.endsWith(".sarif"))
            .map((f) => path.resolve(sarifPath, f));
        for (const filepath of paths) {
            sarifFiles.push(filepath);
        }
        if (sarifFiles.length === 0) {
            throw new Error(`No SARIF files found to upload in "${sarifPath}".`);
        }
    }
    else {
        sarifFiles.push(sarifPath);
    }
    return await uploadFiles(sarifFiles, repositoryNwo, commitOid, ref, analysisKey, analysisName, workflowRunID, checkoutPath, environment, githubAuth, githubUrl, mode, logger);
}
exports.upload = upload;
// Counts the number of results in the given SARIF file
function countResultsInSarif(sarif) {
    let numResults = 0;
    for (const run of JSON.parse(sarif).runs) {
        numResults += run.results.length;
    }
    return numResults;
}
exports.countResultsInSarif = countResultsInSarif;
// Validates that the given file path refers to a valid SARIF file.
// Throws an error if the file is invalid.
function validateSarifFileSchema(sarifFilePath, logger) {
    const sarif = JSON.parse(fs.readFileSync(sarifFilePath, "utf8"));
    const schema = require("../src/sarif_v2.1.0_schema.json");
    const result = new jsonschema.Validator().validate(sarif, schema);
    if (!result.valid) {
        // Output the more verbose error messages in groups as these may be very large.
        for (const error of result.errors) {
            logger.startGroup(`Error details: ${error.stack}`);
            logger.info(JSON.stringify(error, null, 2));
            logger.endGroup();
        }
        // Set the main error message to the stacks of all the errors.
        // This should be of a manageable size and may even give enough to fix the error.
        const sarifErrors = result.errors.map((e) => `- ${e.stack}`);
        throw new Error(`Unable to upload "${sarifFilePath}" as it is not valid SARIF:\n${sarifErrors.join("\n")}`);
    }
}
exports.validateSarifFileSchema = validateSarifFileSchema;
// Uploads the given set of sarif files.
// Returns true iff the upload occurred and succeeded
async function uploadFiles(sarifFiles, repositoryNwo, commitOid, ref, analysisKey, analysisName, workflowRunID, checkoutPath, environment, githubAuth, githubUrl, mode, logger) {
    logger.info(`Uploading sarif files: ${JSON.stringify(sarifFiles)}`);
    if (mode === "actions") {
        // This check only works on actions as env vars don't persist between calls to the runner
        const sentinelEnvVar = "CODEQL_UPLOAD_SARIF";
        if (process.env[sentinelEnvVar]) {
            throw new Error("Aborting upload: only one run of the codeql/analyze or codeql/upload-sarif actions is allowed per job");
        }
        core.exportVariable(sentinelEnvVar, sentinelEnvVar);
    }
    // Validate that the files we were asked to upload are all valid SARIF files
    for (const file of sarifFiles) {
        validateSarifFileSchema(file, logger);
    }
    let sarifPayload = combineSarifFiles(sarifFiles);
    sarifPayload = fingerprints.addFingerprints(sarifPayload, checkoutPath, logger);
    const zipped_sarif = zlib_1.default.gzipSync(sarifPayload).toString("base64");
    const checkoutURI = file_url_1.default(checkoutPath);
    const toolNames = util.getToolNames(sarifPayload);
    let payload;
    if (mode === "actions") {
        payload = JSON.stringify({
            commit_oid: commitOid,
            ref,
            analysis_key: analysisKey,
            analysis_name: analysisName,
            sarif: zipped_sarif,
            workflow_run_id: workflowRunID,
            checkout_uri: checkoutURI,
            environment,
            started_at: process.env[sharedEnv.CODEQL_WORKFLOW_STARTED_AT],
            tool_names: toolNames,
        });
    }
    else {
        payload = JSON.stringify({
            commit_sha: commitOid,
            ref,
            sarif: zipped_sarif,
            checkout_uri: checkoutURI,
            tool_name: toolNames[0],
        });
    }
    // Log some useful debug info about the info
    const rawUploadSizeBytes = sarifPayload.length;
    logger.debug(`Raw upload size: ${rawUploadSizeBytes} bytes`);
    const zippedUploadSizeBytes = zipped_sarif.length;
    logger.debug(`Base64 zipped upload size: ${zippedUploadSizeBytes} bytes`);
    const numResultInSarif = countResultsInSarif(sarifPayload);
    logger.debug(`Number of results in upload: ${numResultInSarif}`);
    // Make the upload
    await uploadPayload(payload, repositoryNwo, githubAuth, githubUrl, mode, logger);
    return {
        raw_upload_size_bytes: rawUploadSizeBytes,
        zipped_upload_size_bytes: zippedUploadSizeBytes,
        num_results_in_sarif: numResultInSarif,
    };
}
//# sourceMappingURL=upload-lib.js.map