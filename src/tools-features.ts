import type { VersionInfo } from "./codeql";

export enum ToolsFeature {
  AnalysisSummaryV2IsDefault = "analysisSummaryV2Default",
  BuildModeOption = "buildModeOption",
  DatabaseInterpretResultsSupportsSarifRunProperty = "databaseInterpretResultsSupportsSarifRunProperty",
  IndirectTracingSupportsStaticBinaries = "indirectTracingSupportsStaticBinaries",
  InformsAboutUnsupportedPathFilters = "informsAboutUnsupportedPathFilters",
  SetsCodeqlRunnerEnvVar = "setsCodeqlRunnerEnvVar",
  TraceCommandUseBuildMode = "traceCommandUseBuildMode",
  SarifMergeRunsFromEqualCategory = "sarifMergeRunsFromEqualCategory",
  ForceOverwrite = "forceOverwrite",
  PythonDefaultIsToNotExtractStdlib = "pythonDefaultIsToNotExtractStdlib",
}

/**
 * Determines if the given feature is supported by the CLI.
 *
 * @param versionInfo Version information, including features, returned by the CLI.
 * @param feature The feature to check for.
 * @returns True if the feature is supported or false otherwise.
 */
export function isSupportedToolsFeature(
  versionInfo: VersionInfo,
  feature: ToolsFeature,
): boolean {
  return !!versionInfo.features && versionInfo.features[feature];
}
