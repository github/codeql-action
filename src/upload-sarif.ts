import * as analyses from "./analyses";
import { FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import * as upload_lib from "./upload-lib";
import { unsafeEntriesInvariant } from "./util";

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
  const sarifGroups = await upload_lib.getGroupedSarifFilePaths(
    logger,
    sarifPath,
  );

  const uploadResults: UploadSarifResults = {};
  for (const [analysisKind, sarifFiles] of unsafeEntriesInvariant(
    sarifGroups,
  )) {
    const analysisConfig = analyses.getAnalysisConfig(analysisKind);
    uploadResults[analysisKind] = await upload_lib.uploadSpecifiedFiles(
      sarifFiles,
      checkoutPath,
      category,
      features,
      logger,
      analysisConfig,
    );
  }

  return uploadResults;
}
