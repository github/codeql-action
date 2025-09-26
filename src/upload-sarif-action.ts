import * as fs from "fs";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { getActionVersion, getTemporaryDirectory } from "./actions-util";
import * as analyses from "./analyses";
import { getGitHubVersion } from "./api-client";
import { Features } from "./feature-flags";
import { Logger, getActionsLogger } from "./logging";
import { getRepositoryNwo } from "./repository";
import {
  createStatusReportBase,
  sendStatusReport,
  StatusReportBase,
  getActionsStatus,
  ActionName,
  isThirdPartyAnalysis,
} from "./status-report";
import * as upload_lib from "./upload-lib";
import {
  ConfigurationError,
  checkActionVersion,
  checkDiskUsage,
  getErrorMessage,
  initializeEnvironment,
  isInTestMode,
  wrapError,
} from "./util";

interface UploadSarifStatusReport
  extends StatusReportBase,
    upload_lib.UploadStatusReport {}

/**
 * Searches for SARIF files for the given `analysis` in the given `sarifPath`.
 * If any are found, then they are uploaded to the appropriate endpoint for the given `analysis`.
 *
 * @param logger The logger to use.
 * @param features Information about FFs.
 * @param sarifPath The path to a SARIF file or directory containing SARIF files.
 * @param pathStats Information about `sarifPath`.
 * @param checkoutPath The checkout path.
 * @param analysis The configuration of the analysis we should upload SARIF files for.
 * @param category The SARIF category to use for the upload.
 * @returns The result of uploading the SARIF file(s) or `undefined` if there are none.
 */
async function findAndUpload(
  logger: Logger,
  features: Features,
  sarifPath: string,
  pathStats: fs.Stats,
  checkoutPath: string,
  analysis: analyses.AnalysisConfig,
  category?: string,
): Promise<upload_lib.UploadResult | undefined> {
  let sarifFiles: string[] | undefined;

  if (pathStats.isDirectory()) {
    sarifFiles = upload_lib.findSarifFilesInDir(
      sarifPath,
      analysis.sarifPredicate,
    );
  } else if (
    pathStats.isFile() &&
    (analysis.sarifPredicate(sarifPath) ||
      (analysis.kind === analyses.AnalysisKind.CodeScanning &&
        !analyses.CodeQuality.sarifPredicate(sarifPath)))
  ) {
    sarifFiles = [sarifPath];
  } else {
    return undefined;
  }

  if (sarifFiles.length !== 0) {
    return await upload_lib.uploadSpecifiedFiles(
      sarifFiles,
      checkoutPath,
      category,
      features,
      logger,
      analysis,
    );
  }

  return undefined;
}

async function sendSuccessStatusReport(
  startedAt: Date,
  uploadStats: upload_lib.UploadStatusReport,
  logger: Logger,
) {
  const statusReportBase = await createStatusReportBase(
    ActionName.UploadSarif,
    "success",
    startedAt,
    undefined,
    await checkDiskUsage(logger),
    logger,
  );
  if (statusReportBase !== undefined) {
    const statusReport: UploadSarifStatusReport = {
      ...statusReportBase,
      ...uploadStats,
    };
    await sendStatusReport(statusReport);
  }
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  initializeEnvironment(getActionVersion());

  const gitHubVersion = await getGitHubVersion();
  checkActionVersion(getActionVersion(), gitHubVersion);

  // Make inputs accessible in the `post` step.
  actionsUtil.persistInputs();

  const repositoryNwo = getRepositoryNwo();
  const features = new Features(
    gitHubVersion,
    repositoryNwo,
    getTemporaryDirectory(),
    logger,
  );

  const startingStatusReportBase = await createStatusReportBase(
    ActionName.UploadSarif,
    "starting",
    startedAt,
    undefined,
    await checkDiskUsage(logger),
    logger,
  );
  if (startingStatusReportBase !== undefined) {
    await sendStatusReport(startingStatusReportBase);
  }

  try {
    // `sarifPath` can either be a path to a single file, or a path to a directory.
    const sarifPath = actionsUtil.getRequiredInput("sarif_file");
    const checkoutPath = actionsUtil.getRequiredInput("checkout_path");
    const category = actionsUtil.getOptionalInput("category");
    const pathStats = fs.lstatSync(sarifPath, { throwIfNoEntry: false });

    if (pathStats === undefined) {
      throw new ConfigurationError(`Path does not exist: ${sarifPath}.`);
    }

    const sarifIds: Array<{ analysis: string; id: string }> = [];
    const uploadResult = await findAndUpload(
      logger,
      features,
      sarifPath,
      pathStats,
      checkoutPath,
      analyses.CodeScanning,
      category,
    );
    if (uploadResult !== undefined) {
      core.setOutput("sarif-id", uploadResult.sarifID);
      sarifIds.push({
        analysis: analyses.AnalysisKind.CodeScanning,
        id: uploadResult.sarifID,
      });
    }

    // If there are `.quality.sarif` files in `sarifPath`, then upload those to the code quality service.
    const qualityUploadResult = await findAndUpload(
      logger,
      features,
      sarifPath,
      pathStats,
      checkoutPath,
      analyses.CodeQuality,
      actionsUtil.fixCodeQualityCategory(logger, category),
    );
    if (qualityUploadResult !== undefined) {
      sarifIds.push({
        analysis: analyses.AnalysisKind.CodeQuality,
        id: qualityUploadResult.sarifID,
      });
    }
    core.setOutput("sarif-ids", JSON.stringify(sarifIds));

    // We don't upload results in test mode, so don't wait for processing
    if (isInTestMode()) {
      core.debug("In test mode. Waiting for processing is disabled.");
    } else if (actionsUtil.getRequiredInput("wait-for-processing") === "true") {
      if (uploadResult !== undefined) {
        await upload_lib.waitForProcessing(
          getRepositoryNwo(),
          uploadResult.sarifID,
          logger,
        );
      }
      // The code quality service does not currently have an endpoint to wait for SARIF processing,
      // so we can't wait for that here.
    }
    await sendSuccessStatusReport(
      startedAt,
      uploadResult?.statusReport || {},
      logger,
    );
  } catch (unwrappedError) {
    const error =
      isThirdPartyAnalysis(ActionName.UploadSarif) &&
      unwrappedError instanceof upload_lib.InvalidSarifUploadError
        ? new ConfigurationError(unwrappedError.message)
        : wrapError(unwrappedError);
    const message = error.message;
    core.setFailed(message);

    const errorStatusReportBase = await createStatusReportBase(
      ActionName.UploadSarif,
      getActionsStatus(error),
      startedAt,
      undefined,
      await checkDiskUsage(logger),
      logger,
      message,
      error.stack,
    );
    if (errorStatusReportBase !== undefined) {
      await sendStatusReport(errorStatusReportBase);
    }
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(
      `codeql/upload-sarif action failed: ${getErrorMessage(error)}`,
    );
  }
}

void runWrapper();
