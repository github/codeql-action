import * as fs from "fs";

import * as actionsUtil from "./actions-util";
import * as analyses from "./analyses";
import { FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import * as upload_lib from "./upload-lib";
import { ConfigurationError } from "./util";

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
export async function findAndUpload(
  logger: Logger,
  features: FeatureEnablement,
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

// Maps analysis kinds to SARIF IDs.
export type UploadSarifResults = Partial<
  Record<analyses.AnalysisKind, upload_lib.UploadResult>
>;

/**
 * Finds SARIF files in `sarifPath` and uploads them to the appropriate services.
 *
 * @param logger The logger to use.
 * @param features Information about enabled features.
 * @param checkoutPath The path where the repository was checked out at.
 * @param sarifPath The path to the file or directory to upload.
 * @param category The analysis category.
 *
 * @returns A partial mapping from analysis kinds to the upload results.
 */
export async function uploadSarif(
  logger: Logger,
  features: FeatureEnablement,
  checkoutPath: string,
  sarifPath: string,
  category?: string,
): Promise<UploadSarifResults> {
  const pathStats = fs.lstatSync(sarifPath, { throwIfNoEntry: false });

  if (pathStats === undefined) {
    throw new ConfigurationError(`Path does not exist: ${sarifPath}.`);
  }

  const uploadResults: UploadSarifResults = {};
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
    uploadResults[analyses.AnalysisKind.CodeScanning] = uploadResult;
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
    uploadResults[analyses.AnalysisKind.CodeQuality] = qualityUploadResult;
  }

  return uploadResults;
}
