import * as fs from "fs";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import * as analyses from "./analyses";
import { FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import * as upload_lib from "./upload-lib";

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
  const sarifFiles: string[] | undefined = upload_lib.getSarifFilePaths(
    sarifPath,
    analysis.sarifPredicate,
    pathStats,
  );

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

export interface UploadSarifResult {
  analysis: analyses.AnalysisKind;
  id: string;
}

export type UploadSarifResults = Partial<
  Record<analyses.AnalysisKind, upload_lib.UploadResult>
>;

export async function uploadSarif(
  logger: Logger,
  features: FeatureEnablement,
  sarifPath: string,
  pathStats: fs.Stats,
  checkoutPath: string,
  category?: string,
): Promise<UploadSarifResults> {
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
    core.setOutput("sarif-id", uploadResult.sarifID);
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

export function uploadResultsToSarifIds(
  uploadResults: UploadSarifResults,
): Partial<Record<analyses.AnalysisKind, string>> {
  const result = {};
  for (const uploadResult of Object.keys(uploadResults)) {
    result[uploadResult] = uploadResults[uploadResult].id;
  }
  return result;
}
