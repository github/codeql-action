import { VersionInfo } from "./codeql";

export enum ToolsFeature {
  FeaturesInVersionResult = "featuresInVersionResult",
  IndirectTracingSupportsStaticBinaries = "indirectTracingSupportsStaticBinaries",
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
