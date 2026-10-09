import { ActionState } from "../action-common";
import { Config } from "../config-utils";
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
export function isSwiftCompatible(
  action: ActionState<["Base"]>,
  config: Config,
) {
  if (
    config.languages.includes(BuiltInLanguage.swift) &&
    action.platform !== "darwin"
  ) {
    throw new ConfigurationError(
      `Swift analysis is only supported on macOS runner images. Please migrate to a macOS runner.`,
    );
  }
}
