import { ConfigurationError } from "./util";

export enum AnalysisKind {
  CodeScanning = "code-scanning",
  CodeQuality = "code-quality",
}

// Exported for testing. A set of all known analysis kinds.
export const supportedAnalysisKinds = new Set(Object.values(AnalysisKind));

/**
 * Parses a comma-separated string into a list of unique analysis kinds.
 * Throws a configuration error if the input contains unknown analysis kinds
 * or doesn't contain at least one element.
 *
 * @param input The comma-separated string to parse.
 * @returns The array of unique analysis kinds that were parsed from the input string.
 */
export async function parseAnalysisKinds(
  input: string,
): Promise<AnalysisKind[]> {
  const components = input.split(",");

  if (components.length < 1) {
    throw new ConfigurationError(
      "At least one analysis kind must be configured.",
    );
  }

  for (const component of components) {
    if (!supportedAnalysisKinds.has(component as AnalysisKind)) {
      throw new ConfigurationError(`Unknown analysis kind: ${component}`);
    }
  }

  // Return all unique elements.
  return Array.from(
    new Set(components.map((component) => component as AnalysisKind)),
  );
}

// Enumerates API endpoints that accept SARIF files.
export enum SARIF_UPLOAD_ENDPOINT {
  CODE_SCANNING = "PUT /repos/:owner/:repo/code-scanning/analysis",
  CODE_QUALITY = "PUT /repos/:owner/:repo/code-quality/analysis",
}

// Represents configurations for different analysis kinds.
export interface AnalysisConfig {
  name: string;
  target: SARIF_UPLOAD_ENDPOINT;
  sarifPredicate: (name: string) => boolean;
  sentinelPrefix: string;
}

// Represents the Code Scanning analysis configuration.
export const CodeScanning: AnalysisConfig = {
  name: "code scanning",
  target: SARIF_UPLOAD_ENDPOINT.CODE_SCANNING,
  sarifPredicate: (name) =>
    name.endsWith(".sarif") && !CodeQuality.sarifPredicate(name),
  sentinelPrefix: "CODEQL_UPLOAD_SARIF_",
};

// Represents the Code Quality analysis configuration.
export const CodeQuality: AnalysisConfig = {
  name: "code quality",
  target: SARIF_UPLOAD_ENDPOINT.CODE_QUALITY,
  sarifPredicate: (name) => name.endsWith(".quality.sarif"),
  sentinelPrefix: "CODEQL_UPLOAD_QUALITY_SARIF_",
};
