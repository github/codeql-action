import * as fs from "fs";
import * as path from "path";
import { env } from "process";
import zlib from "zlib";

import * as core from "@actions/core";
import { OctokitResponse } from "@octokit/types";
import fileUrl from "file-url";
import * as jsonschema from "jsonschema";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import * as fingerprints from "./fingerprints";
import { Logger } from "./logging";
import { parseRepositoryNwo, RepositoryNwo } from "./repository";
import * as sharedEnv from "./shared-environment";
import * as util from "./util";
import { SarifFile, SarifResult, SarifRun } from "./util";
import * as workflow from "./workflow";

// Takes a list of paths to sarif files and combines them together,
// returning the contents of the combined sarif file.
export function combineSarifFiles(sarifFiles: string[]): SarifFile {
  const combinedSarif: SarifFile = {
    version: null,
    runs: [],
  };

  for (const sarifFile of sarifFiles) {
    const sarifObject = JSON.parse(
      fs.readFileSync(sarifFile, "utf8")
    ) as SarifFile;
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

  return combinedSarif;
}

// Populates the run.automationDetails.id field using the analysis_key and environment
// and return an updated sarif file contents.
export function populateRunAutomationDetails(
  sarif: SarifFile,
  category: string | undefined,
  analysis_key: string,
  environment: string | undefined
): SarifFile {
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

function getAutomationID(
  category: string | undefined,
  analysis_key: string,
  environment: string | undefined
): string | undefined {
  if (category !== undefined) {
    let automationID = category;
    if (!automationID.endsWith("/")) {
      automationID += "/";
    }
    return automationID;
  }

  return actionsUtil.computeAutomationID(analysis_key, environment);
}

// Upload the given payload.
// If the request fails then this will retry a small number of times.
async function uploadPayload(
  payload: any,
  repositoryNwo: RepositoryNwo,
  logger: Logger
) {
  logger.info("Uploading results");

  // If in test mode we don't want to upload the results
  if (util.isInTestMode()) {
    const payloadSaveFile = path.join(
      actionsUtil.getTemporaryDirectory(),
      "payload.json"
    );
    logger.info(
      `In test mode. Results are not uploaded. Saving to ${payloadSaveFile}`
    );
    logger.info(`Payload: ${JSON.stringify(payload, null, 2)}`);
    fs.writeFileSync(payloadSaveFile, JSON.stringify(payload, null, 2));
    return;
  }

  const client = api.getApiClient();

  const response = await client.request(
    "PUT /repos/:owner/:repo/code-scanning/analysis",
    {
      owner: repositoryNwo.owner,
      repo: repositoryNwo.repo,
      data: payload,
    }
  );

  logger.debug(`response status: ${response.status}`);
  logger.info("Successfully uploaded results");

  return response.data.id;
}

export interface UploadStatusReport {
  /** Size in bytes of unzipped SARIF upload. */
  raw_upload_size_bytes?: number;
  /** Size in bytes of actual SARIF upload. */
  zipped_upload_size_bytes?: number;
  /** Number of results in the SARIF upload. */
  num_results_in_sarif?: number;
}

export interface UploadResult {
  statusReport: UploadStatusReport;
  sarifID: string;
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
export async function uploadFromActions(
  sarifPath: string,
  checkoutPath: string,
  category: string | undefined,
  logger: Logger
): Promise<UploadResult> {
  return await uploadFiles(
    getSarifFilePaths(sarifPath),
    parseRepositoryNwo(util.getRequiredEnvParam("GITHUB_REPOSITORY")),
    await actionsUtil.getCommitOid(checkoutPath),
    await actionsUtil.getRef(),
    await actionsUtil.getAnalysisKey(),
    category,
    util.getRequiredEnvParam("GITHUB_WORKFLOW"),
    workflow.getWorkflowRunID(),
    checkoutPath,
    actionsUtil.getRequiredInput("matrix"),
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
    throw new Error(
      `Invalid SARIF. JSON syntax error: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
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
  mergeBaseCommitOid: string | undefined
) {
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

  if (actionsUtil.workflowEventName() === "pull_request") {
    if (
      commitOid === util.getRequiredEnvParam("GITHUB_SHA") &&
      mergeBaseCommitOid
    ) {
      // We're uploading results for the merge commit
      // and were able to determine the merge base.
      // So we use that as the most accurate base.
      payloadObj.base_ref = `refs/heads/${util.getRequiredEnvParam(
        "GITHUB_BASE_REF"
      )}`;
      payloadObj.base_sha = mergeBaseCommitOid;
    } else if (process.env.GITHUB_EVENT_PATH) {
      // Either we're not uploading results for the merge commit
      // or we could not determine the merge base.
      // Using the PR base is the only option here
      const githubEvent = JSON.parse(
        fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")
      );
      payloadObj.base_ref = `refs/heads/${githubEvent.pull_request.base.ref}`;
      payloadObj.base_sha = githubEvent.pull_request.base.sha;
    }
  }
  return payloadObj;
}

// Uploads the given set of sarif files.
// Returns true iff the upload occurred and succeeded
async function uploadFiles(
  sarifFiles: string[],
  repositoryNwo: RepositoryNwo,
  commitOid: string,
  ref: string,
  analysisKey: string,
  category: string | undefined,
  analysisName: string | undefined,
  workflowRunID: number | undefined,
  sourceRoot: string,
  environment: string | undefined,
  logger: Logger
): Promise<UploadResult> {
  logger.startGroup("Uploading results");
  logger.info(`Processing sarif files: ${JSON.stringify(sarifFiles)}`);

  // Validate that the files we were asked to upload are all valid SARIF files
  for (const file of sarifFiles) {
    validateSarifFileSchema(file, logger);
  }

  let sarif = combineSarifFiles(sarifFiles);
  sarif = await fingerprints.addFingerprints(sarif, sourceRoot, logger);

  sarif = populateRunAutomationDetails(
    sarif,
    category,
    analysisKey,
    environment
  );

  if (env["CODEQL_DISABLE_SARIF_PRUNING"] !== "true")
    sarif = pruneInvalidResults(sarif, logger);

  const toolNames = util.getToolNames(sarif);

  validateUniqueCategory(sarif);
  const sarifPayload = JSON.stringify(sarif);
  const zippedSarif = zlib.gzipSync(sarifPayload).toString("base64");
  const checkoutURI = fileUrl(sourceRoot);

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
    await actionsUtil.determineMergeBaseCommitOid()
  );

  // Log some useful debug info about the info
  const rawUploadSizeBytes = sarifPayload.length;
  logger.debug(`Raw upload size: ${rawUploadSizeBytes} bytes`);
  const zippedUploadSizeBytes = zippedSarif.length;
  logger.debug(`Base64 zipped upload size: ${zippedUploadSizeBytes} bytes`);
  const numResultInSarif = countResultsInSarif(sarifPayload);
  logger.debug(`Number of results in upload: ${numResultInSarif}`);

  // Make the upload
  const sarifID = await uploadPayload(payload, repositoryNwo, logger);

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

type ProcessingStatus = "pending" | "complete" | "failed";

/**
 * Waits until either the analysis is successfully processed, a processing error
 * is reported, or `STATUS_CHECK_TIMEOUT_MILLISECONDS` elapses.
 *
 * If `isUnsuccessfulExecution` is passed, will throw an error if the analysis
 * processing does not produce a single error mentioning the unsuccessful
 * execution.
 */
export async function waitForProcessing(
  repositoryNwo: RepositoryNwo,
  sarifID: string,
  logger: Logger,
  options: { isUnsuccessfulExecution: boolean } = {
    isUnsuccessfulExecution: false,
  }
): Promise<void> {
  logger.startGroup("Waiting for processing to finish");
  try {
    const client = api.getApiClient();

    const statusCheckingStarted = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (
        Date.now() >
        statusCheckingStarted + STATUS_CHECK_TIMEOUT_MILLISECONDS
      ) {
        // If the analysis hasn't finished processing in the allotted time, we continue anyway rather than failing.
        // It's possible the analysis will eventually finish processing, but it's not worth spending more Actions time waiting.
        logger.warning(
          "Timed out waiting for analysis to finish processing. Continuing."
        );
        break;
      }
      let response: OctokitResponse<any> | undefined = undefined;
      try {
        response = await client.request(
          "GET /repos/:owner/:repo/code-scanning/sarifs/:sarif_id",
          {
            owner: repositoryNwo.owner,
            repo: repositoryNwo.repo,
            sarif_id: sarifID,
          }
        );
      } catch (e) {
        logger.warning(
          `An error occurred checking the status of the delivery. ${e} It should still be processed in the background, but errors that occur during processing may not be reported.`
        );
        break;
      }
      const status = response.data.processing_status as ProcessingStatus;
      logger.info(`Analysis upload status is ${status}.`);

      if (status === "pending") {
        logger.debug("Analysis processing is still pending...");
      } else if (options.isUnsuccessfulExecution) {
        // We expect a specific processing error for unsuccessful executions, so
        // handle these separately.
        handleProcessingResultForUnsuccessfulExecution(
          response,
          status,
          logger
        );
        break;
      } else if (status === "complete") {
        break;
      } else if (status === "failed") {
        throw new Error(
          `Code Scanning could not process the submitted SARIF file:\n${response.data.errors}`
        );
      } else {
        util.assertNever(status);
      }

      await util.delay(STATUS_CHECK_FREQUENCY_MILLISECONDS);
    }
  } finally {
    logger.endGroup();
  }
}

/**
 * Checks the processing result for an unsuccessful execution. Throws if the
 * result is not a failure with a single "unsuccessful execution" error.
 */
function handleProcessingResultForUnsuccessfulExecution(
  response: OctokitResponse<any, number>,
  status: Exclude<ProcessingStatus, "pending">,
  logger: Logger
): void {
  if (
    status === "failed" &&
    Array.isArray(response.data.errors) &&
    response.data.errors.length === 1 &&
    response.data.errors[0].toString().startsWith("unsuccessful execution")
  ) {
    logger.debug(
      "Successfully uploaded a SARIF file for the unsuccessful execution. Received expected " +
        '"unsuccessful execution" error, and no other errors.'
    );
  } else {
    const shortMessage =
      "Failed to upload a SARIF file for the unsuccessful execution. Code scanning status " +
      "information for the repository may be out of date as a result.";
    const longMessage =
      shortMessage + status === "failed"
        ? ` Processing errors: ${response.data.errors}`
        : ' Encountered no processing errors, but expected to receive an "unsuccessful execution" error.';
    logger.debug(longMessage);
    throw new Error(shortMessage);
  }
}

export function validateUniqueCategory(sarif: SarifFile): void {
  // duplicate categories are allowed in the same sarif file
  // but not across multiple sarif files
  const categories = {} as Record<string, { id?: string; tool?: string }>;

  for (const run of sarif.runs) {
    const id = run?.automationDetails?.id;
    const tool = run.tool?.driver?.name;
    const category = `${sanitize(id)}_${sanitize(tool)}`;
    categories[category] = { id, tool };
  }

  for (const [category, { id, tool }] of Object.entries(categories)) {
    const sentinelEnvVar = `CODEQL_UPLOAD_SARIF_${category}`;
    if (process.env[sentinelEnvVar]) {
      throw new Error(
        "Aborting upload: only one run of the codeql/analyze or codeql/upload-sarif actions is allowed per job per tool/category. " +
          "The easiest fix is to specify a unique value for the `category` input. If .runs[].automationDetails.id is specified " +
          "in the sarif file, that will take precedence over your configured `category`. " +
          `Category: (${id ? id : "none"}) Tool: (${tool ? tool : "none"})`
      );
    }
    core.exportVariable(sentinelEnvVar, sentinelEnvVar);
  }
}

/**
 * Santizes a string to be used as an environment variable name.
 * This will replace all non-alphanumeric characters with underscores.
 * There could still be some false category clashes if two uploads
 * occur that differ only in their non-alphanumeric characters. This is
 * unlikely.
 *
 * @param str the initial value to sanitize
 */
function sanitize(str?: string) {
  return (str ?? "_").replace(/[^a-zA-Z0-9_]/g, "_").toLocaleUpperCase();
}

export function pruneInvalidResults(
  sarif: SarifFile,
  logger: Logger
): SarifFile {
  let pruned = 0;
  const newRuns: SarifRun[] = [];
  for (const run of sarif.runs || []) {
    if (
      run.tool?.driver?.name === "CodeQL" &&
      run.tool?.driver?.semanticVersion === "2.11.2"
    ) {
      // Version 2.11.2 of the CodeQL CLI had many false positives in the
      // rb/weak-cryptographic-algorithm query which we prune here. The
      // issue is tracked in https://github.com/github/codeql/issues/11107.
      const newResults: SarifResult[] = [];
      for (const result of run.results || []) {
        if (
          result.ruleId === "rb/weak-cryptographic-algorithm" &&
          (result.message?.text?.includes(" MD5 ") ||
            result.message?.text?.includes(" SHA1 "))
        ) {
          pruned += 1;
          continue;
        }
        newResults.push(result);
      }
      newRuns.push({ ...run, results: newResults });
    } else {
      newRuns.push(run);
    }
  }
  if (pruned > 0) {
    logger.info(
      `Pruned ${pruned} results believed to be invalid from SARIF file.`
    );
  }
  return { ...sarif, runs: newRuns };
}
