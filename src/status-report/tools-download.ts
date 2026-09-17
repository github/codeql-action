import type { ToolsDownloadStatusReport } from "../tools-download";

/** Fields of the init status report populated when the tools source is `download`. */
export interface InitToolsDownloadFields {
  /**
   * Time taken to download the bundle, in milliseconds. Not populated when the bundle is downloaded
   * and extracted concurrently.
   */
  tools_download_duration_ms?: ToolsDownloadStatusReport["downloadDurationMs"];
  /**
   * Time taken to extract the bundle, in milliseconds. Not populated when the bundle is downloaded
   * and extracted concurrently.
   */
  tools_extraction_duration_ms?: ToolsDownloadStatusReport["extractionDurationMs"];
  /**
   * Total time taken to make the bundle available on disk, including failed download attempts
   * before a fallback, in milliseconds.
   */
  tools_total_duration_ms?: ToolsDownloadStatusReport["totalDurationMs"];
  /**
   * Whether the relevant tools dotcom feature flags have been misconfigured.
   * Only populated if we attempt to determine the default version based on the dotcom feature flags. */
  tools_feature_flags_valid?: boolean;
  /** The language of the single-language bundle that was downloaded, if any. */
  tools_bundle_language?: ToolsDownloadStatusReport["bundleLanguage"];
  /**
   * Whether we tried to download a single-language bundle, but it did not exist and we fell back to
   * the combined bundle.
   */
  tools_per_language_bundle_fallback?: ToolsDownloadStatusReport["perLanguageBundleFallback"];
}

/** Converts download results to telemetry fields shared by the init and setup-codeql Actions. */
export function createInitToolsDownloadFields(
  report: ToolsDownloadStatusReport | undefined,
  toolsFeatureFlagsValid: boolean | undefined,
): InitToolsDownloadFields {
  const fields: InitToolsDownloadFields = {};
  if (report?.downloadDurationMs !== undefined) {
    fields.tools_download_duration_ms = report.downloadDurationMs;
  }
  if (report?.extractionDurationMs !== undefined) {
    fields.tools_extraction_duration_ms = report.extractionDurationMs;
  }
  if (report?.totalDurationMs !== undefined) {
    fields.tools_total_duration_ms = report.totalDurationMs;
  }
  if (report?.bundleLanguage !== undefined) {
    fields.tools_bundle_language = report.bundleLanguage;
  }
  if (report?.perLanguageBundleFallback !== undefined) {
    fields.tools_per_language_bundle_fallback =
      report.perLanguageBundleFallback;
  }
  if (toolsFeatureFlagsValid !== undefined) {
    fields.tools_feature_flags_valid = toolsFeatureFlagsValid;
  }
  return fields;
}
