import * as semver from "semver";

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

export const SafeArtifactUploadVersion = "2.20.3";

/**
 * The first version of the CodeQL CLI where artifact upload is safe to use
 * for failed runs. This is not really a feature flag, but it is easiest to
 * model the behavior as a feature flag.
 *
 * This was not captured in a tools feature, so we need to use semver.
 *
 * @param codeQlVersion The version of the CodeQL CLI to check. If not provided, it is assumed to be safe.
 * @returns True if artifact upload is safe to use for failed runs or false otherwise.
 */
export function isSafeArtifactUpload(codeQlVersion?: string): boolean {
  return !codeQlVersion
    ? true
    : semver.gte(codeQlVersion, SafeArtifactUploadVersion);
}
