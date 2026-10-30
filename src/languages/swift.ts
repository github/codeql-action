import type { SemVer } from "semver";

import { CodeQL } from "../codeql";
import type { ActionConfig } from "../config/action-config";
import { ToolsFeature } from "../tools-features";
import { ConfigurationError } from "../util";

import { BuiltInLanguage } from ".";

/**
 * Determines whether we can run a Swift analysis on the current runner.
 *
 * @param config The Action configuration.
 * @param codeql The {@link CodeQL} CLI instance.
 * @param darwinVersion The version of the Darwin kernel on macOS, if any.
 *
 * @throws {ConfigurationError} If Swift analysis is not possible on the current runner.
 */
export async function checkSwiftCompatibility(
  config: ActionConfig<"languages">,
  codeql: CodeQL,
  darwinVersion: SemVer | string | undefined,
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

  // If `darwinVersion` is undefined, then we are not on macOS and Swift analysis is unsupported.
  if (darwinVersion === undefined) {
    throw new ConfigurationError(
      `Swift analysis is only supported on macOS runner images. Please migrate to a macOS runner.`,
    );
  }
}
