import * as fs from "fs";
import * as path from "path";
import zlib from "zlib";

import * as core from "@actions/core";
import fileUrl from "file-url";
import * as jsonschema from "jsonschema";
import * as semver from "semver";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import * as fingerprints from "./fingerprints";
import { Logger } from "./logging";
import { parseRepositoryNwo, RepositoryNwo } from "./repository";
import * as sharedEnv from "./shared-environment";
import * as util from "./util";

// Takes a list of paths to sarif files and combines them together,
// returning the contents of the combined sarif file.
export function combineSarifFiles(sarifFiles: string[]): string {
  const combinedSarif = {
    version: null,
    runs: [] as any[],
  };

  for (const sarifFile of sarifFiles) {
    const sarifObject = JSON.parse(fs.readFileSync(sarifFile, "utf8"));
    // Check SARIF version
    if (combinedSarif.version === null) {
      combinedSarif.version = sarifObject.version;
    } else if (combinedSarif.version !== sarifObject.version) {
      throw new Error(
        `Different SARIF versions encountered: ${combinedSarif.version} and ${sarifObject.version}`
      );
    }

    combinedSarif.runs.push(...sarifObject.runs);
  }

  return JSON.stringify(combinedSarif);
}

// Populates the run.automationDetails.id field using the analysis_key and environment
// and return an updated sarif file contents.
export function populateRunAutomationDetails(
  sarifContents: string,
  analysis_key: string | undefined,
  environment: string | undefined
): string {
  if (analysis_key === undefined) {
    return sarifContents;
  }
  let automationID = `${analysis_key}/`;

  // the id has to be deterministic so we sort the fields
  if (environment !== undefined && environment !== "null") {
    const environmentObject = JSON.parse(environment);
    for (const entry of Object.entries(environmentObject).sort()) {
      automationID += `${entry[0]}:${entry[1]}/`;
    }
  }

  const sarif = JSON.parse(sarifContents);
  for (const run of sarif.runs || []) {
    if (run.automationDetails === undefined) {
      run.automationDetails = {
        id: automationID,
      };
    }
  }

  return JSON.stringify(sarif);
}

// Upload the given payload.
// If the request fails then this will retry a small number of times.
async function uploadPayload(
  payload: any,
  repositoryNwo: RepositoryNwo,
  apiDetails: api.GitHubApiDetails,
  mode: util.Mode,
  logger: Logger
) {
  logger.info("Uploading results");

  // If in test mode we don't want to upload the results
  const testMode = process.env["TEST_MODE"] === "true" || false;
  if (testMode) {
    return;
  }

  const client = api.getApiClient(apiDetails);

  const reqURL =
    mode === "actions"
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

export interface UploadStatusReport {
  // Size in bytes of unzipped SARIF upload
  raw_upload_size_bytes?: number;
  // Size in bytes of actual SARIF upload
  zipped_upload_size_bytes?: number;
  // Number of results in the SARIF upload
  num_results_in_sarif?: number;
}

// Recursively walks a directory and returns all SARIF files it finds.
// Does not follow symlinks.
export function findSarifFilesInDir(sarifPath: string): string[] {
  const sarifFiles: string[] = [];
  const walkSarifFiles = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".sarif")) {
        sarifFiles.push(path.resolve(dir, entry.name));
      } else if (entry.isDirectory()) {
        walkSarifFiles(path.resolve(dir, entry.name));
      }
    }
  };
  walkSarifFiles(sarifPath);
  return sarifFiles;
}

// Uploads a single sarif file or a directory of sarif files
// depending on what the path happens to refer to.
// Returns true iff the upload occurred and succeeded
export async function uploadFromActions(
  sarifPath: string,
  gitHubVersion: util.GitHubVersion,
  apiDetails: api.GitHubApiDetails,
  logger: Logger
): Promise<UploadStatusReport> {
  return await uploadFiles(
    getSarifFilePaths(sarifPath),
    parseRepositoryNwo(actionsUtil.getRequiredEnvParam("GITHUB_REPOSITORY")),
    await actionsUtil.getCommitOid(),
    await actionsUtil.getRef(),
    await actionsUtil.getAnalysisKey(),
    actionsUtil.getRequiredEnvParam("GITHUB_WORKFLOW"),
    actionsUtil.getWorkflowRunID(),
    actionsUtil.getRequiredInput("checkout_path"),
    actionsUtil.getRequiredInput("matrix"),
    gitHubVersion,
    apiDetails,
    "actions",
    logger
  );
}

// Uploads a single sarif file or a directory of sarif files
// depending on what the path happens to refer to.
// Returns true iff the upload occurred and succeeded
export async function uploadFromRunner(
  sarifPath: string,
  repositoryNwo: RepositoryNwo,
  commitOid: string,
  ref: string,
  checkoutPath: string,
  gitHubVersion: util.GitHubVersion,
  apiDetails: api.GitHubApiDetails,
  logger: Logger
): Promise<UploadStatusReport> {
  return await uploadFiles(
    getSarifFilePaths(sarifPath),
    repositoryNwo,
    commitOid,
    ref,
    undefined,
    undefined,
    undefined,
    checkoutPath,
    undefined,
    gitHubVersion,
    apiDetails,
    "runner",
    logger
  );
}

function getSarifFilePaths(sarifPath: string) {
  if (!fs.existsSync(sarifPath)) {
    throw new Error(`Path does not exist: ${sarifPath}`);
  }

  let sarifFiles: string[];
  if (fs.lstatSync(sarifPath).isDirectory()) {
    sarifFiles = findSarifFilesInDir(sarifPath);
    if (sarifFiles.length === 0) {
      throw new Error(`No SARIF files found to upload in "${sarifPath}".`);
    }
  } else {
    sarifFiles = [sarifPath];
  }
  return sarifFiles;
}

// Counts the number of results in the given SARIF file
export function countResultsInSarif(sarif: string): number {
  let numResults = 0;
  let parsedSarif;
  try {
    parsedSarif = JSON.parse(sarif);
  } catch (e) {
    throw new Error(`Invalid SARIF. JSON syntax error: ${e.message}`);
  }
  if (!Array.isArray(parsedSarif.runs)) {
    throw new Error("Invalid SARIF. Missing 'runs' array.");
  }

  for (const run of parsedSarif.runs) {
    if (!Array.isArray(run.results)) {
      throw new Error("Invalid SARIF. Missing 'results' array in run.");
    }
    numResults += run.results.length;
  }
  return numResults;
}

// Validates that the given file path refers to a valid SARIF file.
// Throws an error if the file is invalid.
export function validateSarifFileSchema(sarifFilePath: string, logger: Logger) {
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
    throw new Error(
      `Unable to upload "${sarifFilePath}" as it is not valid SARIF:\n${sarifErrors.join(
        "\n"
      )}`
    );
  }
}

// buildPayload constructs a map ready to be uploaded to the API from the given
// parameters, respecting the current mode and target GitHub instance version.
export function buildPayload(
  commitOid: string,
  ref: string,
  analysisKey: string | undefined,
  analysisName: string | undefined,
  zippedSarif: string,
  workflowRunID: number | undefined,
  checkoutURI: string,
  environment: string | undefined,
  toolNames: string[],
  gitHubVersion: util.GitHubVersion,
  mode: util.Mode
) {
  if (mode === "actions") {
    const payloadObj = {
      commit_oid: commitOid,
      ref,
      analysis_key: analysisKey,
      analysis_name: analysisName,
      sarif: zippedSarif,
      workflow_run_id: workflowRunID,
      checkout_uri: checkoutURI,
      environment,
      started_at: process.env[sharedEnv.CODEQL_WORKFLOW_STARTED_AT],
      tool_names: toolNames,
      base_ref: undefined as undefined | string,
      base_sha: undefined as undefined | string,
    };

    // This behaviour can be made the default when support for GHES 3.0 is discontinued.
    if (
      gitHubVersion.type !== util.GitHubVariant.GHES ||
      semver.satisfies(gitHubVersion.version, `>=3.1`)
    ) {
      if (
        process.env.GITHUB_EVENT_NAME === "pull_request" &&
        process.env.GITHUB_EVENT_PATH
      ) {
        const githubEvent = JSON.parse(
          fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")
        );
        payloadObj.base_ref = `refs/heads/${githubEvent.pull_request.base.ref}`;
        payloadObj.base_sha = githubEvent.pull_request.base.sha;
      }
    }
    return payloadObj;
  } else {
    return {
      commit_sha: commitOid,
      ref,
      sarif: zippedSarif,
      checkout_uri: checkoutURI,
      tool_name: toolNames[0],
    };
  }
}

// Uploads the given set of sarif files.
// Returns true iff the upload occurred and succeeded
async function uploadFiles(
  sarifFiles: string[],
  repositoryNwo: RepositoryNwo,
  commitOid: string,
  ref: string,
  analysisKey: string | undefined,
  analysisName: string | undefined,
  workflowRunID: number | undefined,
  checkoutPath: string,
  environment: string | undefined,
  gitHubVersion: util.GitHubVersion,
  apiDetails: api.GitHubApiDetails,
  mode: util.Mode,
  logger: Logger
): Promise<UploadStatusReport> {
  logger.info(`Uploading sarif files: ${JSON.stringify(sarifFiles)}`);

  if (mode === "actions") {
    // This check only works on actions as env vars don't persist between calls to the runner
    const sentinelEnvVar = "CODEQL_UPLOAD_SARIF";
    if (process.env[sentinelEnvVar]) {
      throw new Error(
        "Aborting upload: only one run of the codeql/analyze or codeql/upload-sarif actions is allowed per job"
      );
    }
    core.exportVariable(sentinelEnvVar, sentinelEnvVar);
  }

  // Validate that the files we were asked to upload are all valid SARIF files
  for (const file of sarifFiles) {
    validateSarifFileSchema(file, logger);
  }

  let sarifPayload = combineSarifFiles(sarifFiles);
  sarifPayload = fingerprints.addFingerprints(
    sarifPayload,
    checkoutPath,
    logger
  );
  sarifPayload = populateRunAutomationDetails(
    sarifPayload,
    analysisKey,
    environment
  );

  const zippedSarif = zlib.gzipSync(sarifPayload).toString("base64");
  const checkoutURI = fileUrl(checkoutPath);

  const toolNames = util.getToolNames(sarifPayload);

  const payload = buildPayload(
    commitOid,
    ref,
    analysisKey,
    analysisName,
    zippedSarif,
    workflowRunID,
    checkoutURI,
    environment,
    toolNames,
    gitHubVersion,
    mode
  );

  // Log some useful debug info about the info
  const rawUploadSizeBytes = sarifPayload.length;
  logger.debug(`Raw upload size: ${rawUploadSizeBytes} bytes`);
  const zippedUploadSizeBytes = zippedSarif.length;
  logger.debug(`Base64 zipped upload size: ${zippedUploadSizeBytes} bytes`);
  const numResultInSarif = countResultsInSarif(sarifPayload);
  logger.debug(`Number of results in upload: ${numResultInSarif}`);

  // Make the upload
  await uploadPayload(payload, repositoryNwo, apiDetails, mode, logger);

  return {
    raw_upload_size_bytes: rawUploadSizeBytes,
    zipped_upload_size_bytes: zippedUploadSizeBytes,
    num_results_in_sarif: numResultInSarif,
  };
}
