import * as semver from "semver";

import { ActionState, Logger } from "../action-common";
import { CodeQL } from "../codeql";
import { Config } from "../config-utils";
import { addDiagnostic, makeDiagnostic } from "../diagnostics";
import { Feature } from "../feature-flags";
import { macOSVersion, xcodeVersion } from "../platform";
import { ToolsFeature } from "../tools-features";
import { ConfigurationError } from "../util";

import { BuiltInLanguage } from ".";

/** macOS 27 and above do not support traced extraction for Swift. */
export const SWIFT_TRACED_UNSUPPORTED_MACOS = 27;

/** Xcode 27 and above do not support traced extraction for Swift. */
export const SWIFT_TRACED_UNSUPPORTED_XCODE = 27;

/**
 * Creates a diagnostic indicating that `version` of `product` is unsupported for traced Swift analysis.
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
  config: Config,
  skipUnsupportedTracedAnalysis: boolean,
  product: "macOS" | "Xcode",
  version: semver.SemVer,
) {
  const baseMessage = [
    `Traced Swift analysis is not supported on ${product} ${SWIFT_TRACED_UNSUPPORTED_MACOS} or above.`,
    `Configure your analysis to run on macOS ${SWIFT_TRACED_UNSUPPORTED_MACOS - 1} or below`,
    `and XCode ${SWIFT_TRACED_UNSUPPORTED_XCODE - 1} or below.`,
  ].join(" ");

  const attributeName = product === "macOS" ? "macOSVersion" : "xcodeVersion";

  // Create a diagnostic that will show up on the TSP.
  addDiagnostic(
    config,
    BuiltInLanguage.swift,
    makeDiagnostic(
      `codeql-action/unsupported-traced-swift-analysis-${product.toLowerCase()}`,
      `Traced Swift analysis is not supported on this version of ${product}`,
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

  // Throw an error to abort the analysis if the FF is enabled or log the message.
  if (skipUnsupportedTracedAnalysis) {
    // ConfigurationErrors are converted to the "aborted" status by the exception handler
    // in `init-action.ts` that guards the call to `isSwiftCompatible`.
    throw new ConfigurationError(baseMessage);
  } else {
    // This will also show up as a workflow annotation.
    logger.warning(baseMessage);
  }
}

/**
 * Determines whether we can run a Swift analysis on the current runner.
 *
 * @param action The Action state.
 * @param config The Action configuration.
 *
 * @throws {ConfigurationError} If Swift analysis is not possible on the current runner.
 * @returns True if we can run a Swift analysis.
 */
export async function checkSwiftCompatibility(
  action: ActionState<["Base", "Logger", "FeatureFlags"]>,
  config: Config,
  codeql: CodeQL,
) {
  // The checks are not relevant if we are not trying to analyse Swift.
  if (!config.languages.includes(BuiltInLanguage.swift)) {
    return;
  }

  // Skip the checks if the `swiftSupportsAllPlatforms` feature is supported by the CLI.
  // This is a forward-looking measure that allows a future CLI update to disable these
  // platform checks in the Action when they shouldn't be enforced anymore.
  if (await codeql.supportsFeature(ToolsFeature.SwiftSupportsAllPlatforms)) {
    return;
  }

  // Try to get the macOS version.
  const version = macOSVersion(action);

  // If `version` is undefined, then we are not on macOS.
  if (version === undefined) {
    throw new ConfigurationError(
      `Swift analysis is only supported on macOS runner images. Please migrate to a macOS runner.`,
    );
  }

  const skipUnsupportedTracedAnalysis = await action.features.getValue(
    Feature.SkipUnsupportedTracedAnalysis,
  );
  if (typeof version === "string") {
    // If we got a string, we are on macOS but couldn't parse the version string.
    action.logger.warning(
      `Unable to determine version of macOS, got: ${version}`,
    );
  } else if (version.major >= SWIFT_TRACED_UNSUPPORTED_MACOS) {
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
    xcodeVer.major >= SWIFT_TRACED_UNSUPPORTED_XCODE
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
