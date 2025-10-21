import { UploadKind } from "./actions-util";
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
 * @param uploadKind The kind of upload that is requested.
 * @param checkoutPath The path where the repository was checked out at.
 * @param sarifPath The path to the file or directory to upload.
 * @param category The analysis category.
 *
 * @returns A partial mapping from analysis kinds to the upload results.
 */
export async function uploadSarif(
  logger: Logger,
  features: FeatureEnablement,
  uploadKind: UploadKind,
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
    const processingResults = await upload_lib.postProcessSarifFiles(
      logger,
      features,
      checkoutPath,
      sarifFiles,
      category,
      analysisConfig,
    );

    // Only perform the actual upload of the processed files, if `uploadKind` is `always`.
    if (uploadKind === "always") {
      uploadResults[analysisKind] = await upload_lib.uploadProcessedFiles(
        logger,
        checkoutPath,
        analysisConfig,
        processingResults,
      );
    }
  }

  return uploadResults;
}
