import * as semver from "semver";

import type { ActionState, Logger } from "../action-common";
import { isSelfHostedRunner } from "../actions-util";
import type { CodeQL } from "../codeql";
import type { ActionConfig } from "../config/action-config";
import { addDiagnostic, makeDiagnostic } from "../diagnostics";
import { DocUrl } from "../doc-url";
import { Feature } from "../feature-flags";
import { darwinVersion, xcodeVersion } from "../platform";
import { ConfigurationError } from "../util";

import { checkSwiftCompatibility } from "./swift";

/** macOS 27 and above do not support traced extraction. */
export const UNSUPPORTED_DARWIN_FOR_TRACED = 27;

/** Xcode 27 and above do not support traced extraction. */
export const UNSUPPORTED_XCODE_FOR_TRACED = 27;

/**
 * Creates a diagnostic indicating that `version` of `product` is unsupported for traced analysis.
 * Depending on `skipUnsupportedTracedAnalysis`, this function then either throws a {@link ConfigurationError}
 * or logs the problem as a warning.
 *
 * @param logger The logger to use.
 * @param config The CodeQL Action configuration.
 * @param tracedLanguages Traced languages that are configured for analysis.
 * @param abortUnsupportedTracedAnalysis Whether this is a fatal error.
 * @param product The product that the version is unsupported of.
 * @param version The unsupported version.
 */
function handleUnsupportedVersion(
  logger: Logger,
  config: ActionConfig<"dbLocation" | "tempDir">,
  tracedLanguages: string[],
  abortUnsupportedTracedAnalysis: boolean,
  product: "macOS" | "Xcode",
  version: semver.SemVer,
) {
  const unsupportedVersion =
    product === "macOS"
      ? UNSUPPORTED_DARWIN_FOR_TRACED
      : UNSUPPORTED_XCODE_FOR_TRACED;
  const baseMessage = [
    `Traced analysis is not supported on ${product} ${unsupportedVersion} or above.`,
    `Configure your analysis to run on macOS ${UNSUPPORTED_DARWIN_FOR_TRACED - 1} or below`,
    `and Xcode ${UNSUPPORTED_XCODE_FOR_TRACED - 1} or below.`,
  ].join(" ");

  const attributeName = product === "macOS" ? "darwinVersion" : "xcodeVersion";

  // Create a diagnostic that will show up on the TSP.
  for (const language of tracedLanguages) {
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
          markdownMessage: [
            baseMessage,
            `For more information, see [this announcement](${DocUrl.UNSUPPORTED_TRACED_ANALYSIS_MACOS27}).`,
          ].join(" "),
          severity: abortUnsupportedTracedAnalysis ? "error" : "warning",
          visibility: {
            cliSummaryTable: true,
            statusPage: true,
            telemetry: true,
          },
        },
      ),
    );
  }

  // Log messages generally don't render as markdown, so we include the URL verbatim there.
  const logMessage = [
    baseMessage,
    `For more information, see ${DocUrl.UNSUPPORTED_TRACED_ANALYSIS_MACOS27}`,
  ].join(" ");

  // Throw an error to abort the analysis if the FF is enabled or log the message.
  if (abortUnsupportedTracedAnalysis) {
    throw new ConfigurationError(logMessage);
  } else {
    // This will also show up as a workflow annotation.
    logger.warning(logMessage);
  }
}

/**
 * Returns traced languages from {@link config} by looking for tracer
 * configurations in the {@link codeql} CLI installation.
 */
export async function hasTracedLanguages(
  config: ActionConfig<"languages">,
  codeql: CodeQL,
): Promise<string[]> {
  const tracedLanguages: string[] = [];

  for (const language of config.languages) {
    if (await codeql.isTracedLanguage(language)) {
      tracedLanguages.push(language);
    }
  }

  return tracedLanguages;
}

/**
 * Determines whether we can run a traced analysis on the current runner.
 *
 * @throws {ConfigurationError} If traced analysis is not possible on the current runner.
 */
export async function checkRunnerSupportsTracedAnalysis(
  action: ActionState<["Base", "Env", "Logger", "FeatureFlags"]>,
  config: ActionConfig<"languages" | "dbLocation" | "tempDir">,
  codeql: CodeQL,
) {
  // Try to get the Darwin version on macOS.
  const version = darwinVersion(action);

  // Perform some initial, Swift-specific checks.
  await checkSwiftCompatibility(config, codeql, version);

  // Skip the checks for unsupported traced analysis if the FF is not enabled.
  if (
    !(await action.features.getValue(Feature.CheckUnsupportedTracedAnalysis))
  ) {
    action.logger.debug(
      "Skipping traced analysis compatibility checks because the feature is not enabled.",
    );
    return;
  }

  // `build-mode: none` doesn't use the tracer, so it is always supported.
  if (config.buildMode !== undefined && config.buildMode === "none") {
    action.logger.debug(
      "Skipping traced analysis compatibility checks because the build mode is 'none'.",
    );
    return;
  }

  // These checks don't apply if we are not on macOS.
  if (version === undefined) {
    action.logger.debug(
      "Skipping traced analysis compatibility checks because we are not on macOS.",
    );
    return;
  }

  // If none of the languages are traced, then we can skip the compatibility checks below as well.
  const tracedLanguages = await hasTracedLanguages(config, codeql);
  if (tracedLanguages.length === 0) {
    action.logger.debug(
      "Skipping traced analysis compatibility checks because no traced languages are being analyzed.",
    );
    return;
  }

  const abortUnsupportedTracedAnalysis = await action.features.getValue(
    Feature.AbortUnsupportedTracedAnalysis,
  );
  if (typeof version === "string") {
    // If we got a string, we are on macOS but couldn't parse the version string.
    action.logger.warning(
      `Unable to parse Darwin kernel version, got: ${version}. Skipping macOS compatibility check.`,
    );
  } else if (version.major >= UNSUPPORTED_DARWIN_FOR_TRACED) {
    handleUnsupportedVersion(
      action.logger,
      config,
      tracedLanguages,
      abortUnsupportedTracedAnalysis,
      "macOS",
      version,
    );

    // Return early so that we don't end up producing more-or-less the same log message/diagnostic
    // twice. The ones for macOS already comment on the Xcode requirement.
    return;
  }

  // Skip if we are on a self-hosted runner since the current Xcode version detection
  // is only validated on hosted runners.
  if (isSelfHostedRunner(action.env)) {
    action.logger.debug(
      "Skipping traced analysis compatibility check for Xcode because we are on a self-hosted runner.",
    );
    return;
  }

  // Determining whether the Xcode version is supported only makes sense on macOS, so we only do it
  // after determining that we are running on macOS.
  const xcodeVer = await xcodeVersion(action.logger);

  if (
    xcodeVer !== undefined &&
    xcodeVer.major >= UNSUPPORTED_XCODE_FOR_TRACED
  ) {
    handleUnsupportedVersion(
      action.logger,
      config,
      tracedLanguages,
      abortUnsupportedTracedAnalysis,
      "Xcode",
      xcodeVer,
    );
  } else if (xcodeVer === undefined) {
    action.logger.info(
      "Unable to determine Xcode version. Skipping Xcode compatibility check.",
    );
  }
}
