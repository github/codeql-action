import * as nodefs from "fs";

import * as semver from "semver";

import { ActionState, Logger } from "../action-common";
import { CodeQL } from "../codeql";
import { Config } from "../config-utils";
import { addDiagnostic, makeDiagnostic } from "../diagnostics";
import { Feature } from "../feature-flags";
import { FileSystem } from "../fs";
import { macOSVersion } from "../platform";
import { ToolsFeature } from "../tools-features";
import { ConfigurationError, getErrorMessage } from "../util";

import { BuiltInLanguage } from ".";

/** The static path we check for a symbolic link to the (dynamic) Xcode location. */
export const XCODE_SELECT_LINK_PATH = "/private/var/db/xcode_select_link";

/** The pattern we expect to find in the Xcode path. */
export const XCODE_APP_FILENAME_PATTERN = new RegExp(
  /(?<filename>Xcode_(?<majorMinor>\d+.\d+).app)/,
);

/** macOS 27 and above do not support traced extraction for Swift. */
export const SWIFT_TRACED_UNSUPPORTED_MACOS = 27;

/** Xcode 27 and above do not support traced extraction for Swift. */
export const SWIFT_TRACED_UNSUPPORTED_XCODE = 27;

/**
 * Tries to determine the version of Xcode that is installed.
 *
 * @param logger The logger to use.
 * @returns The Xcode version or `undefined` if it couldn't be determined.
 */
export function xcodeVersion(
  logger: Logger,
  fs: FileSystem<"statSync" | "readlinkSync"> = nodefs,
): semver.SemVer | undefined {
  try {
    // Stat the expected symbolic link to check that it exists and is a symbolic link.
    // The `readlinkSync` call below returns an empty string in either case and so
    // this check allows us to distinguish between the two cases.
    const stats = fs.statSync(XCODE_SELECT_LINK_PATH);

    if (!stats.isSymbolicLink()) {
      logger.warning(
        `${XCODE_SELECT_LINK_PATH} exists, but is not a symbolic link.`,
      );
      return undefined;
    }

    // Read what the symbolic link points to.
    const xcodePath = fs.readlinkSync(XCODE_SELECT_LINK_PATH);

    if (xcodePath === "") {
      logger.warning(
        `Resolving ${XCODE_SELECT_LINK_PATH} unexpectedly returned nothing.`,
      );
      return undefined;
    }

    // Try to extract the version from the path.
    const matchResult = xcodePath.match(XCODE_APP_FILENAME_PATTERN);

    if (matchResult?.groups === undefined) {
      logger.warning(
        `Xcode path '${xcodePath}' does not contain expected pattern.`,
      );
      return undefined;
    }

    const majorMinor = matchResult.groups["majorMinor"];
    const version = semver.coerce(majorMinor);

    if (version === null) {
      logger.warning(`Couldn't parse '${majorMinor}' as a semantic version.`);
      return undefined;
    }
    return version;
  } catch (err) {
    logger.warning(
      `Unable to determine Xcode version: ${getErrorMessage(err)}`,
    );
    return undefined;
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
export async function isSwiftCompatible(
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
  // If we got a string, we are on macOS but couldn't parse the version string.
  if (typeof version === "string") {
    action.logger.warning(
      `Unable to determine version of macOS, got: ${version}`,
    );
    return;
  }

  const skipUnsupportedTracedAnalysis = await action.features.getValue(
    Feature.SwiftSkipUnsupportedTracedAnalysis,
  );
  if (version.major >= SWIFT_TRACED_UNSUPPORTED_MACOS) {
    const baseMessage = [
      `Traced Swift analysis is not supported on macOS ${SWIFT_TRACED_UNSUPPORTED_MACOS} or above.`,
      `Configure your analysis to run on macOS ${SWIFT_TRACED_UNSUPPORTED_MACOS - 1} or below`,
      `and XCode ${SWIFT_TRACED_UNSUPPORTED_XCODE - 1} or below.`,
    ].join(" ");

    // Create a diagnostic that will show up on the TSP.
    addDiagnostic(
      config,
      BuiltInLanguage.swift,
      makeDiagnostic(
        "codeql-action/unsupported-traced-swift-analysis-macos",
        "Traced Swift analysis is not supported on this version of macOS",
        {
          attributes: {
            languages: config.languages,
            macOSVersion: version.toString(),
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
      action.logger.warning(baseMessage);
    }
  }
}
