import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import zlib from "zlib";

import * as core from "@actions/core";
import { OctokitResponse } from "@octokit/types";
import * as jsonschema from "jsonschema";

import * as actionsUtil from "./actions-util";
import * as analyses from "./analyses";
import * as api from "./api-client";
import { getGitHubVersion, wrapApiConfigurationError } from "./api-client";
import { CodeQL, getCodeQL } from "./codeql";
import { getConfig } from "./config-utils";
import { readDiffRangesJsonFile } from "./diff-informed-analysis-utils";
import { EnvVar } from "./environment";
import { FeatureEnablement } from "./feature-flags";
import * as fingerprints from "./fingerprints";
import * as gitUtils from "./git-utils";
import { initCodeQL } from "./init";
import { Logger } from "./logging";
import { getRepositoryNwo, RepositoryNwo } from "./repository";
import { ToolsFeature } from "./tools-features";
import * as util from "./util";
import {
  ConfigurationError,
  getErrorMessage,
  getRequiredEnvParam,
  GitHubVariant,
  GitHubVersion,
  satisfiesGHESVersion,
  SarifFile,
  SarifRun,
} from "./util";

const GENERIC_403_MSG =
  "The repo on which this action is running has not opted-in to CodeQL code scanning.";
const GENERIC_404_MSG =
  "The CodeQL code scanning feature is forbidden on this repository.";

// Takes a list of paths to sarif files and combines them together,
// returning the contents of the combined sarif file.
function combineSarifFiles(sarifFiles: string[], logger: Logger): SarifFile {
  logger.info(`Loading SARIF file(s)`);
  const combinedSarif: SarifFile = {
    version: null,
    runs: [],
  };

  for (const sarifFile of sarifFiles) {
    logger.debug(`Loading SARIF file: ${sarifFile}`);
    const sarifObject = JSON.parse(
      fs.readFileSync(sarifFile, "utf8"),
    ) as SarifFile;
    // Check SARIF version
    if (combinedSarif.version === null) {
      combinedSarif.version = sarifObject.version;
    } else if (combinedSarif.version !== sarifObject.version) {
      throw new InvalidSarifUploadError(
        `Different SARIF versions encountered: ${combinedSarif.version} and ${sarifObject.version}`,
      );
    }

    combinedSarif.runs.push(...sarifObject.runs);
  }

  return combinedSarif;
}

/**
 * Checks whether all the runs in the given SARIF files were produced by CodeQL.
 * @param sarifObjects The list of SARIF objects to check.
 */
function areAllRunsProducedByCodeQL(sarifObjects: SarifFile[]): boolean {
  return sarifObjects.every((sarifObject) => {
    return sarifObject.runs?.every(
      (run) => run.tool?.driver?.name === "CodeQL",
    );
  });
}

type SarifRunKey = {
  name: string | undefined;
  fullName: string | undefined;
  version: string | undefined;
  semanticVersion: string | undefined;
  guid: string | undefined;
  automationId: string | undefined;
};

function createRunKey(run: SarifRun): SarifRunKey {
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
function areAllRunsUnique(sarifObjects: SarifFile[]): boolean {
  const keys = new Set<string>();

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
export async function shouldShowCombineSarifFilesDeprecationWarning(
  sarifObjects: util.SarifFile[],
  githubVersion: GitHubVersion,
) {
  // Do not show this warning on GHES versions before 3.14.0
  if (
    githubVersion.type === GitHubVariant.GHES &&
    satisfiesGHESVersion(githubVersion.version, "<3.14", true)
  ) {
    return false;
  }

  // Only give a deprecation warning when not all runs are unique and
  // we haven't already shown the warning.
  return (
    !areAllRunsUnique(sarifObjects) &&
    !process.env.CODEQL_MERGE_SARIF_DEPRECATION_WARNING
  );
}

export async function throwIfCombineSarifFilesDisabled(
  sarifObjects: util.SarifFile[],
  githubVersion: GitHubVersion,
) {
  if (!(await shouldDisableCombineSarifFiles(sarifObjects, githubVersion))) {
    return;
  }

  const deprecationMoreInformationMessage =
    "For more information, see https://github.blog/changelog/2025-07-21-code-scanning-will-stop-combining-multiple-sarif-runs-uploaded-in-the-same-sarif-file/";

  throw new ConfigurationError(
    `The CodeQL Action does not support uploading multiple SARIF runs with the same category. Please update your workflow to upload a single run per category. ${deprecationMoreInformationMessage}`,
  );
}

// Checks whether combining SARIF files should be disabled.
async function shouldDisableCombineSarifFiles(
  sarifObjects: util.SarifFile[],
  githubVersion: GitHubVersion,
) {
  if (githubVersion.type === GitHubVariant.GHES) {
    // Never block on GHES versions before 3.18.
    if (satisfiesGHESVersion(githubVersion.version, "<3.18", true)) {
      return false;
    }
  }

  if (areAllRunsUnique(sarifObjects)) {
    // If all runs are unique, we can safely combine them.
    return false;
  }

  // Combining SARIF files is not supported and Code Scanning will return an
  // error if multiple runs with the same category are uploaded.
  return true;
}

// Takes a list of paths to sarif files and combines them together using the
// CLI `github merge-results` command when all SARIF files are produced by
// CodeQL. Otherwise, it will fall back to combining the files in the action.
// Returns the contents of the combined sarif file.
async function combineSarifFilesUsingCLI(
  sarifFiles: string[],
  gitHubVersion: GitHubVersion,
  features: FeatureEnablement,
  logger: Logger,
): Promise<SarifFile> {
  logger.info("Combining SARIF files using the CodeQL CLI");

  const sarifObjects = sarifFiles.map((sarifFile): SarifFile => {
    return JSON.parse(fs.readFileSync(sarifFile, "utf8")) as SarifFile;
  });

  const deprecationWarningMessage =
    gitHubVersion.type === GitHubVariant.GHES
      ? "and will be removed in GitHub Enterprise Server 3.18"
      : "and will be removed in July 2025";
  const deprecationMoreInformationMessage =
    "For more information, see https://github.blog/changelog/2024-05-06-code-scanning-will-stop-combining-runs-from-a-single-upload";

  if (!areAllRunsProducedByCodeQL(sarifObjects)) {
    await throwIfCombineSarifFilesDisabled(sarifObjects, gitHubVersion);

    logger.debug(
      "Not all SARIF files were produced by CodeQL. Merging files in the action.",
    );

    if (
      await shouldShowCombineSarifFilesDeprecationWarning(
        sarifObjects,
        gitHubVersion,
      )
    ) {
      logger.warning(
        `Uploading multiple SARIF runs with the same category is deprecated ${deprecationWarningMessage}. Please update your workflow to upload a single run per category. ${deprecationMoreInformationMessage}`,
      );
      core.exportVariable("CODEQL_MERGE_SARIF_DEPRECATION_WARNING", "true");
    }

    // If not, use the naive method of combining the files.
    return combineSarifFiles(sarifFiles, logger);
  }

  // Initialize CodeQL, either by using the config file from the 'init' step,
  // or by initializing it here.
  let codeQL: CodeQL;
  let tempDir: string = actionsUtil.getTemporaryDirectory();

  const config = await getConfig(tempDir, logger);
  if (config !== undefined) {
    codeQL = await getCodeQL(config.codeQLCmd);
    tempDir = config.tempDir;
  } else {
    logger.info(
      "Initializing CodeQL since the 'init' Action was not called before this step.",
    );

    const apiDetails = {
      auth: actionsUtil.getRequiredInput("token"),
      externalRepoAuth: actionsUtil.getOptionalInput(
        "external-repository-token",
      ),
      url: getRequiredEnvParam("GITHUB_SERVER_URL"),
      apiURL: getRequiredEnvParam("GITHUB_API_URL"),
    };

    const codeQLDefaultVersionInfo = await features.getDefaultCliVersion(
      gitHubVersion.type,
    );

    const initCodeQLResult = await initCodeQL(
      undefined, // There is no tools input on the upload action
      apiDetails,
      tempDir,
      gitHubVersion.type,
      codeQLDefaultVersionInfo,
      features,
      logger,
    );

    codeQL = initCodeQLResult.codeql;
  }

  if (
    !(await codeQL.supportsFeature(
      ToolsFeature.SarifMergeRunsFromEqualCategory,
    ))
  ) {
    await throwIfCombineSarifFilesDisabled(sarifObjects, gitHubVersion);

    logger.warning(
      "The CodeQL CLI does not support merging SARIF files. Merging files in the action.",
    );

    if (
      await shouldShowCombineSarifFilesDeprecationWarning(
        sarifObjects,
        gitHubVersion,
      )
    ) {
      logger.warning(
        `Uploading multiple CodeQL runs with the same category is deprecated ${deprecationWarningMessage} for CodeQL CLI 2.16.6 and earlier. Please update your CodeQL CLI version or update your workflow to set a distinct category for each CodeQL run. ${deprecationMoreInformationMessage}`,
      );
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

  return JSON.parse(fs.readFileSync(outputFile, "utf8")) as SarifFile;
}

// Populates the run.automationDetails.id field using the analysis_key and environment
// and return an updated sarif file contents.
export function populateRunAutomationDetails(
  sarif: SarifFile,
  category: string | undefined,
  analysis_key: string,
  environment: string | undefined,
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
  environment: string | undefined,
): string | undefined {
  if (category !== undefined) {
    let automationID = category;
    if (!automationID.endsWith("/")) {
      automationID += "/";
    }
    return automationID;
  }

  return api.computeAutomationID(analysis_key, environment);
}

/**
 * Upload the given payload.
 * If the request fails then this will retry a small number of times.
 * This is exported for testing purposes only.
 */
export async function uploadPayload(
  payload: any,
  repositoryNwo: RepositoryNwo,
  logger: Logger,
  analysis: analyses.AnalysisConfig,
): Promise<string> {
  logger.info("Uploading results");

  if (util.shouldSkipSarifUpload()) {
    const payloadSaveFile = path.join(
      actionsUtil.getTemporaryDirectory(),
      `payload-${analysis.kind}.json`,
    );
    logger.info(
      `SARIF upload disabled by an environment variable. Saving to ${payloadSaveFile}`,
    );
    logger.info(`Payload: ${JSON.stringify(payload, null, 2)}`);
    fs.writeFileSync(payloadSaveFile, JSON.stringify(payload, null, 2));
    return "dummy-sarif-id";
  }

  const client = api.getApiClient();

  try {
    const response = await client.request(analysis.target, {
      owner: repositoryNwo.owner,
      repo: repositoryNwo.repo,
      data: payload,
    });

    logger.debug(`response status: ${response.status}`);
    logger.info("Successfully uploaded results");
    return response.data.id as string;
  } catch (e) {
    const httpError = util.asHTTPError(e);
    if (httpError !== undefined) {
      switch (httpError.status) {
        case 403:
          core.warning(httpError.message || GENERIC_403_MSG);
          break;
        case 404:
          core.warning(httpError.message || GENERIC_404_MSG);
          break;
        default:
          core.warning(httpError.message);
          break;
      }
    }
    throw wrapApiConfigurationError(e);
  }
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
export function findSarifFilesInDir(
  sarifPath: string,
  isSarif: (name: string) => boolean,
): string[] {
  const sarifFiles: string[] = [];
  const walkSarifFiles = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && isSarif(entry.name)) {
        sarifFiles.push(path.resolve(dir, entry.name));
      } else if (entry.isDirectory()) {
        walkSarifFiles(path.resolve(dir, entry.name));
      }
    }
  };
  walkSarifFiles(sarifPath);
  return sarifFiles;
}

export function getSarifFilePaths(
  sarifPath: string,
  isSarif: (name: string) => boolean,
) {
  if (!fs.existsSync(sarifPath)) {
    // This is always a configuration error, even for first-party runs.
    throw new ConfigurationError(`Path does not exist: ${sarifPath}`);
  }

  let sarifFiles: string[];
  if (fs.lstatSync(sarifPath).isDirectory()) {
    sarifFiles = findSarifFilesInDir(sarifPath, isSarif);
    if (sarifFiles.length === 0) {
      // This is always a configuration error, even for first-party runs.
      throw new ConfigurationError(
        `No SARIF files found to upload in "${sarifPath}".`,
      );
    }
  } else {
    sarifFiles = [sarifPath];
  }
  return sarifFiles;
}

type GroupedSarifFiles = Partial<Record<analyses.AnalysisKind, string[]>>;

/**
 * Finds SARIF files in `sarifPath`, and groups them by analysis kind, following `SarifScanOrder`.
 *
 * @param logger The logger to use.
 * @param sarifPath The path of a file or directory to recursively scan for SARIF files.
 * @returns The `.sarif` files found in `sarifPath`, grouped by analysis kind.
 */
export async function getGroupedSarifFilePaths(
  logger: Logger,
  sarifPath: string,
): Promise<GroupedSarifFiles> {
  const stats = fs.statSync(sarifPath, { throwIfNoEntry: false });

  if (stats === undefined) {
    // This is always a configuration error, even for first-party runs.
    throw new ConfigurationError(`Path does not exist: ${sarifPath}`);
  }

  const results: GroupedSarifFiles = {};

  if (stats.isDirectory()) {
    let unassignedSarifFiles = findSarifFilesInDir(
      sarifPath,
      (name) => path.extname(name) === ".sarif",
    );
    logger.debug(
      `Found the following .sarif files in ${sarifPath}: ${unassignedSarifFiles.join(", ")}`,
    );

    for (const analysisConfig of analyses.SarifScanOrder) {
      const filesForCurrentAnalysis = unassignedSarifFiles.filter(
        analysisConfig.sarifPredicate,
      );
      if (filesForCurrentAnalysis.length > 0) {
        logger.debug(
          `The following SARIF files are for ${analysisConfig.name}: ${filesForCurrentAnalysis.join(", ")}`,
        );
        // Looping through the array a second time is not efficient, but more readable.
        // Change this to one loop for both calls to `filter` if this becomes a bottleneck.
        unassignedSarifFiles = unassignedSarifFiles.filter(
          (name) => !analysisConfig.sarifPredicate(name),
        );
        results[analysisConfig.kind] = filesForCurrentAnalysis;
      } else {
        logger.debug(`Found no SARIF files for ${analysisConfig.name}`);
      }
    }

    if (unassignedSarifFiles.length !== 0) {
      logger.warning(
        `Found files in ${sarifPath} which do not belong to any analysis: ${unassignedSarifFiles.join(", ")}`,
      );
    }
  } else {
    for (const analysisConfig of analyses.SarifScanOrder) {
      if (
        analysisConfig.kind === analyses.AnalysisKind.CodeScanning ||
        analysisConfig.sarifPredicate(sarifPath)
      ) {
        logger.debug(
          `Using '${sarifPath}' as a SARIF file for ${analysisConfig.name}.`,
        );
        results[analysisConfig.kind] = [sarifPath];
        break;
      }
    }
  }

  return results;
}

// Counts the number of results in the given SARIF file
function countResultsInSarif(sarif: string): number {
  let numResults = 0;
  const parsedSarif = JSON.parse(sarif);
  if (!Array.isArray(parsedSarif.runs)) {
    throw new InvalidSarifUploadError("Invalid SARIF. Missing 'runs' array.");
  }

  for (const run of parsedSarif.runs) {
    if (!Array.isArray(run.results)) {
      throw new InvalidSarifUploadError(
        "Invalid SARIF. Missing 'results' array in run.",
      );
    }
    numResults += run.results.length;
  }
  return numResults;
}

export function readSarifFile(sarifFilePath: string): SarifFile {
  try {
    return JSON.parse(fs.readFileSync(sarifFilePath, "utf8")) as SarifFile;
  } catch (e) {
    throw new InvalidSarifUploadError(
      `Invalid SARIF. JSON syntax error: ${getErrorMessage(e)}`,
    );
  }
}

// Validates the given SARIF object and throws an error if the SARIF object is invalid.
// The file path is only used in error messages to improve clarity.
export function validateSarifFileSchema(
  sarif: SarifFile,
  sarifFilePath: string,
  logger: Logger,
) {
  if (
    areAllRunsProducedByCodeQL([sarif]) &&
    // We want to validate CodeQL SARIF in testing environments.
    !util.getTestingEnvironment()
  ) {
    logger.debug(
      `Skipping SARIF schema validation for ${sarifFilePath} as all runs are produced by CodeQL.`,
    );
    return;
  }

  logger.info(`Validating ${sarifFilePath}`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = require("../src/sarif-schema-2.1.0.json") as jsonschema.Schema;

  const result = new jsonschema.Validator().validate(sarif, schema);
  // Filter errors related to invalid URIs in the artifactLocation field as this
  // is a breaking change. See https://github.com/github/codeql-action/issues/1703
  const warningAttributes = ["uri-reference", "uri"];
  const errors = (result.errors ?? []).filter(
    (err) =>
      !(
        err.name === "format" &&
        typeof err.argument === "string" &&
        warningAttributes.includes(err.argument)
      ),
  );
  const warnings = (result.errors ?? []).filter(
    (err) =>
      err.name === "format" &&
      typeof err.argument === "string" &&
      warningAttributes.includes(err.argument),
  );

  for (const warning of warnings) {
    logger.info(
      `Warning: '${warning.instance}' is not a valid URI in '${warning.property}'.`,
    );
  }

  if (errors.length > 0) {
    // Output the more verbose error messages in groups as these may be very large.
    for (const error of errors) {
      logger.startGroup(`Error details: ${error.stack}`);
      logger.info(JSON.stringify(error, null, 2));
      logger.endGroup();
    }

    // Set the main error message to the stacks of all the errors.
    // This should be of a manageable size and may even give enough to fix the error.
    const sarifErrors = errors.map((e) => `- ${e.stack}`);
    throw new InvalidSarifUploadError(
      `Unable to upload "${sarifFilePath}" as it is not valid SARIF:\n${sarifErrors.join(
        "\n",
      )}`,
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
  workflowRunID: number,
  workflowRunAttempt: number,
  checkoutURI: string,
  environment: string | undefined,
  toolNames: string[],
  mergeBaseCommitOid: string | undefined,
) {
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
    started_at: process.env[EnvVar.WORKFLOW_STARTED_AT],
    tool_names: toolNames,
    base_ref: undefined as undefined | string,
    base_sha: undefined as undefined | string,
  };

  if (actionsUtil.getWorkflowEventName() === "pull_request") {
    if (
      commitOid === util.getRequiredEnvParam("GITHUB_SHA") &&
      mergeBaseCommitOid
    ) {
      // We're uploading results for the merge commit
      // and were able to determine the merge base.
      // So we use that as the most accurate base.
      payloadObj.base_ref = `refs/heads/${util.getRequiredEnvParam(
        "GITHUB_BASE_REF",
      )}`;
      payloadObj.base_sha = mergeBaseCommitOid;
    } else if (process.env.GITHUB_EVENT_PATH) {
      // Either we're not uploading results for the merge commit
      // or we could not determine the merge base.
      // Using the PR base is the only option here
      const githubEvent = JSON.parse(
        fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
      );
      payloadObj.base_ref = `refs/heads/${githubEvent.pull_request.base.ref}`;
      payloadObj.base_sha = githubEvent.pull_request.base.sha;
    }
  }
  return payloadObj;
}

/**
 * Uploads a single SARIF file or a directory of SARIF files depending on what `inputSarifPath` refers
 * to.
 */
export async function uploadFiles(
  inputSarifPath: string,
  checkoutPath: string,
  category: string | undefined,
  features: FeatureEnablement,
  logger: Logger,
  uploadTarget: analyses.AnalysisConfig,
): Promise<UploadResult> {
  const sarifPaths = getSarifFilePaths(
    inputSarifPath,
    uploadTarget.sarifPredicate,
  );

  return uploadSpecifiedFiles(
    sarifPaths,
    checkoutPath,
    category,
    features,
    logger,
    uploadTarget,
  );
}

/**
 * Uploads the given array of SARIF files.
 */
export async function uploadSpecifiedFiles(
  sarifPaths: string[],
  checkoutPath: string,
  category: string | undefined,
  features: FeatureEnablement,
  logger: Logger,
  uploadTarget: analyses.AnalysisConfig,
): Promise<UploadResult> {
  logger.startGroup(`Uploading ${uploadTarget.name} results`);
  logger.info(`Processing sarif files: ${JSON.stringify(sarifPaths)}`);

  const gitHubVersion = await getGitHubVersion();

  let sarif: SarifFile;
  category = uploadTarget.fixCategory(logger, category);

  if (sarifPaths.length > 1) {
    // Validate that the files we were asked to upload are all valid SARIF files
    for (const sarifPath of sarifPaths) {
      const parsedSarif = readSarifFile(sarifPath);
      validateSarifFileSchema(parsedSarif, sarifPath, logger);
    }

    sarif = await combineSarifFilesUsingCLI(
      sarifPaths,
      gitHubVersion,
      features,
      logger,
    );
  } else {
    const sarifPath = sarifPaths[0];
    sarif = readSarifFile(sarifPath);
    validateSarifFileSchema(sarif, sarifPath, logger);

    // Validate that there are no runs for the same category
    await throwIfCombineSarifFilesDisabled([sarif], gitHubVersion);
  }

  sarif = filterAlertsByDiffRange(logger, sarif);
  sarif = await fingerprints.addFingerprints(sarif, checkoutPath, logger);

  const analysisKey = await api.getAnalysisKey();
  const environment = actionsUtil.getRequiredInput("matrix");
  sarif = populateRunAutomationDetails(
    sarif,
    category,
    analysisKey,
    environment,
  );

  const toolNames = util.getToolNames(sarif);

  logger.debug(`Validating that each SARIF run has a unique category`);
  validateUniqueCategory(sarif, uploadTarget.sentinelPrefix);
  logger.debug(`Serializing SARIF for upload`);
  const sarifPayload = JSON.stringify(sarif);

  const dumpDir = process.env[EnvVar.SARIF_DUMP_DIR];
  if (dumpDir) {
    dumpSarifFile(sarifPayload, dumpDir, logger, uploadTarget);
  }

  logger.debug(`Compressing serialized SARIF`);
  const zippedSarif = zlib.gzipSync(sarifPayload).toString("base64");
  const checkoutURI = url.pathToFileURL(checkoutPath).href;

  const payload = buildPayload(
    await gitUtils.getCommitOid(checkoutPath),
    await gitUtils.getRef(),
    analysisKey,
    util.getRequiredEnvParam("GITHUB_WORKFLOW"),
    zippedSarif,
    actionsUtil.getWorkflowRunID(),
    actionsUtil.getWorkflowRunAttempt(),
    checkoutURI,
    environment,
    toolNames,
    await gitUtils.determineBaseBranchHeadCommitOid(),
  );

  // Log some useful debug info about the info
  const rawUploadSizeBytes = sarifPayload.length;
  logger.debug(`Raw upload size: ${rawUploadSizeBytes} bytes`);
  const zippedUploadSizeBytes = zippedSarif.length;
  logger.debug(`Base64 zipped upload size: ${zippedUploadSizeBytes} bytes`);
  const numResultInSarif = countResultsInSarif(sarifPayload);
  logger.debug(`Number of results in upload: ${numResultInSarif}`);

  // Make the upload
  const sarifID = await uploadPayload(
    payload,
    getRepositoryNwo(),
    logger,
    uploadTarget,
  );

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

/**
 * Dumps the given processed SARIF file contents to `outputDir`.
 */
function dumpSarifFile(
  sarifPayload: string,
  outputDir: string,
  logger: Logger,
  uploadTarget: analyses.AnalysisConfig,
) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  } else if (!fs.lstatSync(outputDir).isDirectory()) {
    throw new ConfigurationError(
      `The path specified by the ${EnvVar.SARIF_DUMP_DIR} environment variable exists and is not a directory: ${outputDir}`,
    );
  }
  const outputFile = path.resolve(
    outputDir,
    `upload${uploadTarget.sarifExtension}`,
  );
  logger.info(`Dumping processed SARIF file to ${outputFile}`);
  fs.writeFileSync(outputFile, sarifPayload);
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
  },
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
        // It's possible the analysis will eventually finish processing, but it's not worth spending more
        // Actions time waiting.
        logger.warning(
          "Timed out waiting for analysis to finish processing. Continuing.",
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
          },
        );
      } catch (e) {
        logger.warning(
          `An error occurred checking the status of the delivery. ${e} It should still be processed in the background, but errors that occur during processing may not be reported.`,
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
          logger,
        );
        break;
      } else if (status === "complete") {
        break;
      } else if (status === "failed") {
        const message = `Code Scanning could not process the submitted SARIF file:\n${response.data.errors}`;
        const processingErrors = response.data.errors as string[];
        throw shouldConsiderConfigurationError(processingErrors)
          ? new ConfigurationError(message)
          : shouldConsiderInvalidRequest(processingErrors)
            ? new InvalidSarifUploadError(message)
            : new Error(message);
      } else {
        util.assertNever(status);
      }

      await util.delay(STATUS_CHECK_FREQUENCY_MILLISECONDS, {
        allowProcessExit: false,
      });
    }
  } finally {
    logger.endGroup();
  }
}

/**
 * Returns whether the provided processing errors are a configuration error.
 */
export function shouldConsiderConfigurationError(
  processingErrors: string[],
): boolean {
  const expectedConfigErrors = [
    "CodeQL analyses from advanced configurations cannot be processed when the default setup is enabled",
    "rejecting delivery as the repository has too many logical alerts",
    "A delivery cannot contain multiple runs with the same category",
  ];

  return (
    processingErrors.length === 1 &&
    expectedConfigErrors.some((msg) => processingErrors[0].includes(msg))
  );
}

/**
 * Returns whether the provided processing errors are the result of an invalid SARIF upload request.
 */
export function shouldConsiderInvalidRequest(
  processingErrors: string[],
): boolean {
  return processingErrors.every(
    (error) =>
      error.startsWith("rejecting SARIF") ||
      error.startsWith("an invalid URI was provided as a SARIF location") ||
      error.startsWith("locationFromSarifResult: expected artifact location") ||
      error.startsWith(
        "could not convert rules: invalid security severity value, is not a number",
      ) ||
      /^SARIF URI scheme [^\s]* did not match the checkout URI scheme [^\s]*/.test(
        error,
      ),
  );
}

/**
 * Checks the processing result for an unsuccessful execution. Throws if the
 * result is not a failure with a single "unsuccessful execution" error.
 */
function handleProcessingResultForUnsuccessfulExecution(
  response: OctokitResponse<any, number>,
  status: Exclude<ProcessingStatus, "pending">,
  logger: Logger,
): void {
  if (
    status === "failed" &&
    Array.isArray(response.data.errors) &&
    response.data.errors.length === 1 &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    response.data.errors[0].toString().startsWith("unsuccessful execution")
  ) {
    logger.info(
      "Successfully uploaded a SARIF file for the unsuccessful execution. Received expected " +
        '"unsuccessful execution" processing error, and no other errors.',
    );
  } else if (status === "failed") {
    logger.warning(
      `Failed to upload a SARIF file for the unsuccessful execution. Code scanning status ` +
        `information for the repository may be out of date as a result. Processing errors: ${response.data.errors}`,
    );
  } else if (status === "complete") {
    // There is a known transient issue with the code scanning API where it sometimes reports
    // `complete` for an unsuccessful execution submission.
    logger.debug(
      "Uploaded a SARIF file for the unsuccessful execution, but did not receive the expected " +
        '"unsuccessful execution" processing error. This is a known transient issue with the ' +
        "code scanning API, and does not cause out of date code scanning status information.",
    );
  } else {
    util.assertNever(status);
  }
}

export function validateUniqueCategory(
  sarif: SarifFile,
  sentinelPrefix: string,
): void {
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
    const sentinelEnvVar = `${sentinelPrefix}${category}`;
    if (process.env[sentinelEnvVar]) {
      // This is always a configuration error, even for first-party runs.
      throw new ConfigurationError(
        "Aborting upload: only one run of the codeql/analyze or codeql/upload-sarif actions is allowed per job per tool/category. " +
          "The easiest fix is to specify a unique value for the `category` input. If .runs[].automationDetails.id is specified " +
          "in the sarif file, that will take precedence over your configured `category`. " +
          `Category: (${id ? id : "none"}) Tool: (${tool ? tool : "none"})`,
      );
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
function sanitize(str?: string) {
  return (str ?? "_").replace(/[^a-zA-Z0-9_]/g, "_").toLocaleUpperCase();
}

/**
 * An error that occurred due to an invalid SARIF upload request.
 */
export class InvalidSarifUploadError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function filterAlertsByDiffRange(logger: Logger, sarif: SarifFile): SarifFile {
  const diffRanges = readDiffRangesJsonFile(logger);
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
          return diffRanges.some(
            (range) =>
              range.path === locationPath &&
              ((range.startLine <= locationStartLine &&
                range.endLine >= locationStartLine) ||
                (range.startLine === 0 && range.endLine === 0)),
          );
        });
      });
    }
  }

  return sarif;
}
