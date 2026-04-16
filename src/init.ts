import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as github from "@actions/github";
import * as io from "@actions/io";
import * as yaml from "js-yaml";

import {
  getOptionalInput,
  isAnalyzingPullRequest,
  isDefaultSetup,
  isSelfHostedRunner,
} from "./actions-util";
import { GitHubApiDetails } from "./api-client";
import { CodeQL, setupCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { EnvVar } from "./environment";
import {
  CodeQLDefaultVersionInfo,
  Feature,
  FeatureEnablement,
} from "./feature-flags";
import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "./feature-flags/properties";
import { BuiltInLanguage, Language } from "./languages";
import { Logger, withGroupAsync } from "./logging";
import { ToolsSource } from "./setup-codeql";
import { ZstdAvailability } from "./tar";
import { ToolsDownloadStatusReport } from "./tools-download";
import * as util from "./util";

export async function initCodeQL(
  toolsInput: string | undefined,
  apiDetails: GitHubApiDetails,
  tempDir: string,
  variant: util.GitHubVariant,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  features: FeatureEnablement,
  logger: Logger,
): Promise<{
  codeql: CodeQL;
  toolsDownloadStatusReport?: ToolsDownloadStatusReport;
  toolsSource: ToolsSource;
  toolsVersion: string;
  zstdAvailability: ZstdAvailability;
}> {
  logger.startGroup("Setup CodeQL tools");
  const {
    codeql,
    toolsDownloadStatusReport,
    toolsSource,
    toolsVersion,
    zstdAvailability,
  } = await setupCodeQL(
    toolsInput,
    apiDetails,
    tempDir,
    variant,
    defaultCliVersion,
    features,
    logger,
    true,
  );
  await codeql.printVersion();
  logger.endGroup();
  return {
    codeql,
    toolsDownloadStatusReport,
    toolsSource,
    toolsVersion,
    zstdAvailability,
  };
}

export async function initConfig(
  features: FeatureEnablement,
  inputs: configUtils.InitConfigInputs,
): Promise<configUtils.Config> {
  return await withGroupAsync("Load language configuration", async () => {
    return await configUtils.initConfig(features, inputs);
  });
}

export async function runDatabaseInitCluster(
  databaseInitEnvironment: Record<string, string | undefined>,
  codeql: CodeQL,
  config: configUtils.Config,
  sourceRoot: string,
  processName: string | undefined,
  qlconfigFile: string | undefined,
  logger: Logger,
): Promise<void> {
  fs.mkdirSync(config.dbLocation, { recursive: true });
  await configUtils.wrapEnvironment(
    databaseInitEnvironment,
    async () =>
      await codeql.databaseInitCluster(
        config,
        sourceRoot,
        processName,
        qlconfigFile,
        logger,
      ),
  );
}

/**
 * Check whether all query packs are compatible with the overlay analysis
 * support in the CodeQL CLI. If the check fails, this function will log a
 * warning and returns false.
 *
 * @param codeql A CodeQL instance.
 * @param logger A logger.
 * @returns `true` if all query packs are compatible with overlay analysis,
 * `false` otherwise.
 */
export async function checkPacksForOverlayCompatibility(
  codeql: CodeQL,
  config: configUtils.Config,
  logger: Logger,
): Promise<boolean> {
  const codeQlOverlayVersion = (await codeql.getVersion()).overlayVersion;
  if (codeQlOverlayVersion === undefined) {
    logger.warning("The CodeQL CLI does not support overlay analysis.");
    return false;
  }

  for (const language of config.languages) {
    const suitePath = util.getGeneratedSuitePath(config, language);
    const packDirs = await codeql.resolveQueriesStartingPacks([suitePath]);
    if (
      packDirs.some(
        (packDir) =>
          !checkPackForOverlayCompatibility(
            packDir,
            codeQlOverlayVersion,
            logger,
          ),
      )
    ) {
      return false;
    }
  }

  return true;
}

/** Interface for `qlpack.yml` file contents. */
interface QlPack {
  buildMetadata?: string;
}

/**
 * Check a single pack for its overlay compatibility. If the check fails, this
 * function will log a warning and returns false.
 *
 * @param packDir Path to the directory containing the pack.
 * @param codeQlOverlayVersion The overlay version of the CodeQL CLI.
 * @param logger A logger.
 * @returns `true` if the pack is compatible with overlay analysis, `false`
 * otherwise.
 */
function checkPackForOverlayCompatibility(
  packDir: string,
  codeQlOverlayVersion: number,
  logger: Logger,
): boolean {
  try {
    let qlpackPath = path.join(packDir, "qlpack.yml");
    if (!fs.existsSync(qlpackPath)) {
      qlpackPath = path.join(packDir, "codeql-pack.yml");
    }
    const qlpackContents = yaml.load(
      fs.readFileSync(qlpackPath, "utf8"),
    ) as QlPack;
    if (!qlpackContents.buildMetadata) {
      // This is a source-only pack, and overlay compatibility checks apply only
      // to precompiled packs.
      return true;
    }

    const packInfoPath = path.join(packDir, ".packinfo");
    if (!fs.existsSync(packInfoPath)) {
      logger.warning(
        `The query pack at ${packDir} does not have a .packinfo file, ` +
          "so it cannot support overlay analysis. Recompiling the query pack " +
          "with the latest CodeQL CLI should solve this problem.",
      );
      return false;
    }

    const packInfoFileContents = JSON.parse(
      fs.readFileSync(packInfoPath, "utf8"),
    );
    const packOverlayVersion = packInfoFileContents.overlayVersion;
    if (typeof packOverlayVersion !== "number") {
      logger.warning(
        `The .packinfo file for the query pack at ${packDir} ` +
          "does not have the overlayVersion field, which indicates that " +
          "the pack is not compatible with overlay analysis.",
      );
      return false;
    }

    if (packOverlayVersion !== codeQlOverlayVersion) {
      logger.warning(
        `The query pack at ${packDir} was compiled with ` +
          `overlay version ${packOverlayVersion}, but the CodeQL CLI ` +
          `supports overlay version ${codeQlOverlayVersion}. The ` +
          "query pack needs to be recompiled to support overlay analysis.",
      );
      return false;
    }
  } catch (e) {
    logger.warning(
      `Error while checking pack at ${packDir} ` +
        `for overlay compatibility: ${util.getErrorMessage(e)}`,
    );
    return false;
  }

  return true;
}

/**
 * If we are running python 3.12+ on windows, we need to switch to python 3.11.
 * This check happens in a powershell script.
 */
export async function checkInstallPython311(
  languages: Language[],
  codeql: CodeQL,
) {
  if (
    languages.includes(BuiltInLanguage.python) &&
    process.platform === "win32" &&
    !(await codeql.getVersion()).features?.supportsPython312
  ) {
    const script = path.resolve(
      __dirname,
      "../python-setup",
      "check_python12.ps1",
    );
    await new toolrunner.ToolRunner(await io.which("powershell", true), [
      script,
    ]).exec();
  }
}

export function cleanupDatabaseClusterDirectory(
  config: configUtils.Config,
  logger: Logger,
  options: { disableExistingDirectoryWarning?: boolean } = {},
  // We can't stub the fs module in tests, so we allow the caller to override the rmSync function
  // for testing.
  rmSync = fs.rmSync,
): void {
  if (
    fs.existsSync(config.dbLocation) &&
    (fs.statSync(config.dbLocation).isFile() ||
      fs.readdirSync(config.dbLocation).length > 0)
  ) {
    if (!options.disableExistingDirectoryWarning) {
      logger.warning(
        `The database cluster directory ${config.dbLocation} must be empty. Attempting to clean it up.`,
      );
    }
    try {
      rmSync(config.dbLocation, {
        force: true,
        maxRetries: 3,
        recursive: true,
      });

      logger.info(
        `Cleaned up database cluster directory ${config.dbLocation}.`,
      );
    } catch (e) {
      const blurb = `The CodeQL Action requires an empty database cluster directory. ${
        getOptionalInput("db-location")
          ? `This is currently configured to be ${config.dbLocation}. `
          : `By default, this is located at ${config.dbLocation}. ` +
            "You can customize it using the 'db-location' input to the init Action. "
      }An attempt was made to clean up the directory, but this failed.`;

      // Hosted runners are automatically cleaned up, so this error should not occur for hosted runners.
      if (isSelfHostedRunner()) {
        throw new util.ConfigurationError(
          `${blurb} This can happen if another process is using the directory or the directory is owned by a different user. ` +
            `Please clean up the directory manually and rerun the job. Details: ${util.getErrorMessage(
              e,
            )}`,
        );
      } else {
        throw new Error(
          `${blurb} This shouldn't typically happen on hosted runners. ` +
            "If you are using an advanced setup, please check your workflow, otherwise we " +
            `recommend rerunning the job. Details: ${util.getErrorMessage(e)}`,
        );
      }
    }
  }
}

export async function getFileCoverageInformationEnabled(
  debugMode: boolean,
  codeql: CodeQL,
  features: FeatureEnablement,
  repositoryProperties: RepositoryProperties,
): Promise<{
  enabled: boolean;
  enabledByRepositoryProperty: boolean;
  showDeprecationWarning: boolean;
}> {
  // Always enable file coverage information in debug mode
  if (debugMode) {
    return {
      enabled: true,
      enabledByRepositoryProperty: false,
      showDeprecationWarning: false,
    };
  }
  // We're most interested in speeding up PRs, and we want to keep
  // submitting file coverage information for the default branch since
  // it is used to populate the status page.
  if (!isAnalyzingPullRequest()) {
    return {
      enabled: true,
      enabledByRepositoryProperty: false,
      showDeprecationWarning: false,
    };
  }
  // If the user has explicitly opted out via an environment variable, don't
  // show the deprecation warning.
  if (
    (process.env[EnvVar.FILE_COVERAGE_ON_PRS] || "").toLocaleLowerCase() ===
    "true"
  ) {
    return {
      enabled: true,
      enabledByRepositoryProperty: false,
      showDeprecationWarning: false,
    };
  }
  // Allow repositories to opt in to file coverage information on PRs
  // using a repository property. In this case, don't show the deprecation
  // warning since the repository has explicitly opted in.
  if (
    repositoryProperties[RepositoryPropertyName.FILE_COVERAGE_ON_PRS] === true
  ) {
    return {
      enabled: true,
      enabledByRepositoryProperty: true,
      showDeprecationWarning: false,
    };
  }
  // If the feature is disabled, then maintain the previous behavior of
  // unconditionally computing file coverage information, but warn that
  // file coverage on PRs will be disabled in a future release.
  if (!(await features.getValue(Feature.SkipFileCoverageOnPrs, codeql))) {
    return {
      enabled: true,
      enabledByRepositoryProperty: false,
      showDeprecationWarning: true,
    };
  }
  // Otherwise, disable file coverage information on PRs to speed up analysis.
  return {
    enabled: false,
    enabledByRepositoryProperty: false,
    showDeprecationWarning: false,
  };
}

/**
 * Log a warning about the deprecation of file coverage information on PRs, including how to opt
 * back in via an environment variable or repository property.
 */
export function logFileCoverageOnPrsDeprecationWarning(logger: Logger): void {
  if (process.env[EnvVar.DID_LOG_FILE_COVERAGE_ON_PRS_DEPRECATION]) {
    return;
  }

  const repositoryOwnerType: string | undefined =
    github.context.payload.repository?.owner.type;

  let message =
    "Starting April 2026, the CodeQL Action will skip computing file coverage information on pull requests " +
    "to improve analysis performance. File coverage information will still be computed on non-PR analyses.";
  const envVarOptOut =
    "set the `CODEQL_ACTION_FILE_COVERAGE_ON_PRS` environment variable to `true`.";
  const repoPropertyOptOut =
    "create a custom repository property with the name " +
    '`github-codeql-file-coverage-on-prs` and the type "True/false", then set this property to ' +
    "`true` in the repository's settings.";

  if (repositoryOwnerType === "Organization") {
    // Org-owned repo: can use the repository property
    if (isDefaultSetup()) {
      message += `\n\nTo opt out of this change, ${repoPropertyOptOut}`;
    } else {
      message += `\n\nTo opt out of this change, ${envVarOptOut} Alternatively, ${repoPropertyOptOut}`;
    }
  } else if (isDefaultSetup()) {
    // User-owned repo on default setup: no repo property available and
    // no way to set env vars, so need to switch to advanced setup.
    message += `\n\nTo opt out of this change, switch to an advanced setup workflow and ${envVarOptOut}`;
  } else {
    // User-owned repo on advanced setup: can set the env var
    message += `\n\nTo opt out of this change, ${envVarOptOut}`;
  }

  logger.warning(message);
  core.exportVariable(EnvVar.DID_LOG_FILE_COVERAGE_ON_PRS_DEPRECATION, "true");
}
