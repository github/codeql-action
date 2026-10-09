import { ActionState } from "../action-common";
import { CodeQL } from "../codeql";
import { Config } from "../config-utils";
import { macOSVersion } from "../platform";
import { ToolsFeature } from "../tools-features";
import { ConfigurationError } from "../util";

import { BuiltInLanguage } from ".";

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
  action: ActionState<["Base", "Logger"]>,
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
}
