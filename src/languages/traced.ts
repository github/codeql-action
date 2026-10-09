import * as semver from "semver";

import type { ActionState, Logger } from "../action-common";
import type { CodeQL } from "../codeql";
import type { ActionConfig } from "../config/action-config";
import { addDiagnostic, makeDiagnostic } from "../diagnostics";
import { Feature } from "../feature-flags";
import { macOSVersion, xcodeVersion } from "../platform";
import { ConfigurationError } from "../util";

import { checkSwiftCompatibility } from "./swift";

/** macOS 27 and above do not support traced extraction. */
export const UNSUPPORTED_MACOS_FOR_TRACED = 27;

/** Xcode 27 and above do not support traced extraction. */
export const UNSUPPORTED_XCODE_FOR_TRACED = 27;

/**
 * Creates a diagnostic indicating that `version` of `product` is unsupported for traced  analysis.
 * Depending on `skipUnsupportedTracedAnalysis`, this function then either throws a {@link ConfigurationError}
 * or logs the problem as a warning.
 *
 * @param logger The logger to use.
 * @param config The CodeQL Action configuration.
 * @param skipUnsupportedTracedAnalysis Whether this is a fatal error.
 * @param product The product that the version is unsupported of.
 * @param version The unsupported version.
 */
function handleUnsupportedVersion(
  logger: Logger,
  config: ActionConfig<"languages" | "dbLocation" | "tempDir">,
  skipUnsupportedTracedAnalysis: boolean,
  product: "macOS" | "Xcode",
  version: semver.SemVer,
) {
  const baseMessage = [
    `Traced analysis is not supported on ${product} ${UNSUPPORTED_MACOS_FOR_TRACED} or above.`,
    `Configure your analysis to run on macOS ${UNSUPPORTED_MACOS_FOR_TRACED - 1} or below`,
    `and XCode ${UNSUPPORTED_XCODE_FOR_TRACED - 1} or below.`,
  ].join(" ");

  const attributeName = product === "macOS" ? "macOSVersion" : "xcodeVersion";

  // Create a diagnostic that will show up on the TSP.
  for (const language of config.languages) {
    addDiagnostic(
      config,
      language,
      makeDiagnostic(
        `codeql-action/unsupported-traced-analysis-${product.toLowerCase()}`,
        `Traced analysis is not supported on this version of ${product}`,
        {
          attributes: {
            languages: config.languages,
            [attributeName]: version.toString(),
          },
          markdownMessage: baseMessage,
          severity: skipUnsupportedTracedAnalysis ? "error" : "warning",
          visibility: {
            cliSummaryTable: true,
            statusPage: true,
            telemetry: true,
          },
        },
      ),
    );
  }

  // Throw an error to abort the analysis if the FF is enabled or log the message.
  if (skipUnsupportedTracedAnalysis) {
    // ConfigurationErrors are converted to the "aborted" status by the exception handler
    // in `init-action.ts` that guards the call to `checkRunnerSupportsTracedAnalysis`.
    throw new ConfigurationError(baseMessage);
  } else {
    // This will also show up as a workflow annotation.
    logger.warning(baseMessage);
  }
}

/**
 * Determines whether we can run a traced analysis on the current runner.
 *
 * @throws {ConfigurationError} If traced analysis is not possible on the current runner.
 */
export async function checkRunnerSupportsTracedAnalysis(
  action: ActionState<["Base", "Logger", "FeatureFlags"]>,
  config: ActionConfig<"languages" | "dbLocation" | "tempDir">,
  codeql: CodeQL,
) {
  // Try to get the macOS version.
  const version = macOSVersion(action);

  // Perform some initial, Swift-specific checks.
  await checkSwiftCompatibility(config, codeql, version);

  const skipUnsupportedTracedAnalysis = await action.features.getValue(
    Feature.SkipUnsupportedTracedAnalysis,
  );
  if (typeof version === "string") {
    // If we got a string, we are on macOS but couldn't parse the version string.
    action.logger.warning(
      `Unable to determine version of macOS, got: ${version}`,
    );
  } else if (
    version !== undefined &&
    version.major >= UNSUPPORTED_MACOS_FOR_TRACED
  ) {
    handleUnsupportedVersion(
      action.logger,
      config,
      skipUnsupportedTracedAnalysis,
      "macOS",
      version,
    );
  }

  // Determining whether the Xcode version is supported only makes sense on macOS, so we only do it
  // after determining that we are running on macOS.
  const xcodeVer = xcodeVersion(action.logger);

  if (
    xcodeVer !== undefined &&
    xcodeVer.major >= UNSUPPORTED_XCODE_FOR_TRACED
  ) {
    handleUnsupportedVersion(
      action.logger,
      config,
      skipUnsupportedTracedAnalysis,
      "Xcode",
      xcodeVer,
    );
  }
}
