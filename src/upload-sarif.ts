import * as fs from "fs";

import * as analyses from "./analyses";
import { Features } from "./feature-flags";
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
  features: Features,
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
