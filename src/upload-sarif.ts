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
 * Finds SARIF files in `sarifPath`, post-processes them, and uploads them to the appropriate services.
 *
 * @param logger The logger to use.
 * @param features Information about enabled features.
 * @param uploadKind The kind of upload that is requested.
 * @param checkoutPath The path where the repository was checked out at.
 * @param sarifPath The path to the file or directory to upload.
 * @param category The analysis category.
 * @param postProcessedOutputPath The path to a directory to which the post-processed SARIF files should be written to.
 *
 * @returns A partial mapping from analysis kinds to the upload results.
 */
export async function postProcessAndUploadSarif(
  logger: Logger,
  features: FeatureEnablement,
  uploadKind: UploadKind,
  checkoutPath: string,
  sarifPath: string,
  category?: string,
  postProcessedOutputPath?: string,
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
    const postProcessingResults = await upload_lib.postProcessSarifFiles(
      logger,
      features,
      checkoutPath,
      sarifFiles,
      category,
      analysisConfig,
    );

    // Write the post-processed SARIF files to disk. This will only write them if needed based on user inputs
    // or environment variables.
    await upload_lib.writePostProcessedFiles(
      logger,
      postProcessedOutputPath,
      analysisConfig,
      postProcessingResults,
    );

    // Only perform the actual upload of the post-processed files if `uploadKind` is `always`.
    if (uploadKind === "always") {
      uploadResults[analysisKind] = await upload_lib.uploadPostProcessedFiles(
        logger,
        checkoutPath,
        analysisConfig,
        postProcessingResults,
      );
    }
  }

  return uploadResults;
}
