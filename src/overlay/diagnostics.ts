import { type CodeQL } from "../codeql";
import { type Config } from "../config-utils";
import {
  addNoLanguageDiagnostic,
  makeDiagnostic,
  makeTelemetryDiagnostic,
} from "../diagnostics";
import { DocUrl } from "../doc-url";
import { RepositoryPropertyName } from "../feature-flags/properties";

/** Reason why overlay analysis was disabled. */
export enum OverlayDisabledReason {
  /** Overlay analysis was disabled by a repository property. */
  DisabledByRepositoryProperty = "disabled-by-repository-property",
  /** Overlay analysis feature was not enabled. */
  FeatureNotEnabled = "feature-not-enabled",
  /** The build mode is incompatible with overlay analysis. */
  IncompatibleBuildMode = "incompatible-build-mode",
  /** The CodeQL CLI version is too old to support overlay analysis. */
  IncompatibleCodeQl = "incompatible-codeql",
  /** The Git version could not be determined or is too old. */
  IncompatibleGit = "incompatible-git",
  /** The runner does not have enough disk space or memory. */
  InsufficientResources = "insufficient-resources",
  /** The source root is not inside a git repository. */
  NoGitRoot = "no-git-root",
  /** Overlay analysis was skipped because it previously failed with similar hardware resources. */
  SkippedDueToCachedStatus = "skipped-due-to-cached-status",
  /** Disk usage could not be determined during the overlay status check. */
  UnableToDetermineDiskUsage = "unable-to-determine-disk-usage",
}

/**
 * Add diagnostics related to why overlay was disabled. This includes:
 *
 * - A telemetry diagnostic that logs the disablement reason.
 * - User-facing diagnostics for specific disablement reasons that are
 *   actionable by the user.
 */
export async function addOverlayDisablementDiagnostics(
  config: Config,
  codeql: CodeQL,
  overlayDisabledReason: OverlayDisabledReason,
): Promise<void> {
  addNoLanguageDiagnostic(
    config,
    makeTelemetryDiagnostic(
      "codeql-action/overlay-disabled",
      "Overlay analysis disabled",
      {
        reason: overlayDisabledReason,
      },
    ),
  );

  if (
    overlayDisabledReason === OverlayDisabledReason.SkippedDueToCachedStatus
  ) {
    addNoLanguageDiagnostic(
      config,
      makeDiagnostic(
        "codeql-action/overlay-disabled-due-to-cached-status",
        "Skipped improved incremental analysis because it failed previously with similar hardware resources",
        {
          attributes: {
            languages: config.languages,
          },
          markdownMessage:
            `Improved incremental analysis was skipped because it previously failed for this repository ` +
            `with CodeQL version ${(await codeql.getVersion()).version} on a runner with similar hardware resources. ` +
            "Improved incremental analysis may require a significant amount of disk space for some repositories. " +
            "If you want to enable improved incremental analysis, increase the disk space available " +
            "to the runner. If that doesn't help, contact GitHub Support for further assistance.\n\n" +
            "Improved incremental analysis will be automatically retried when the next version of CodeQL is released. " +
            `You can also manually trigger a retry by [removing](${DocUrl.DELETE_ACTIONS_CACHE_ENTRIES}) \`codeql-overlay-status-*\` entries from the Actions cache.`,
          severity: "note",
          visibility: {
            cliSummaryTable: true,
            statusPage: true,
            telemetry: false,
          },
        },
      ),
    );
  }

  if (
    overlayDisabledReason === OverlayDisabledReason.DisabledByRepositoryProperty
  ) {
    addNoLanguageDiagnostic(
      config,
      makeDiagnostic(
        "codeql-action/overlay-disabled-by-repository-property",
        "Improved incremental analysis disabled by repository property",
        {
          attributes: {
            languages: config.languages,
          },
          markdownMessage:
            "Improved incremental analysis has been disabled because the " +
            `\`${RepositoryPropertyName.DISABLE_OVERLAY}\` repository property is set to \`true\`. ` +
            "To re-enable improved incremental analysis, set this property to `false` or remove it.",
          severity: "note",
          visibility: {
            cliSummaryTable: true,
            statusPage: true,
            telemetry: false,
          },
        },
      ),
    );
  }
}
