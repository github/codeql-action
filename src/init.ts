import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";

import { getOptionalInput, isSelfHostedRunner } from "./actions-util";
import { GitHubApiCombinedDetails, GitHubApiDetails } from "./api-client";
import { CodeQL, setupCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { CodeQLDefaultVersionInfo, FeatureEnablement } from "./feature-flags";
import { Language, isScannedLanguage } from "./languages";
import { Logger } from "./logging";
import { ToolsSource } from "./setup-codeql";
import { ZstdAvailability } from "./tar";
import { ToolsDownloadStatusReport } from "./tools-download";
import { ToolsFeature } from "./tools-features";
import { TracerConfig, getCombinedTracerConfig } from "./tracer-config";
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
    logger,
    features,
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
  inputs: configUtils.InitConfigInputs,
  codeql: CodeQL,
): Promise<configUtils.Config> {
  const logger = inputs.logger;
  logger.startGroup("Load language configuration");
  const config = await configUtils.initConfig(inputs);
  if (
    !(await codeql.supportsFeature(
      ToolsFeature.InformsAboutUnsupportedPathFilters,
    ))
  ) {
    printPathFiltersWarning(config, logger);
  }
  logger.endGroup();
  return config;
}

export async function runInit(
  codeql: CodeQL,
  config: configUtils.Config,
  sourceRoot: string,
  processName: string | undefined,
  registriesInput: string | undefined,
  apiDetails: GitHubApiCombinedDetails,
  logger: Logger,
): Promise<TracerConfig | undefined> {
  fs.mkdirSync(config.dbLocation, { recursive: true });

  const { registriesAuthTokens, qlconfigFile } =
    await configUtils.generateRegistries(
      registriesInput,
      config.tempDir,
      logger,
    );
  await configUtils.wrapEnvironment(
    {
      GITHUB_TOKEN: apiDetails.auth,
      CODEQL_REGISTRIES_AUTH: registriesAuthTokens,
    },

    // Init a database cluster
    async () =>
      await codeql.databaseInitCluster(
        config,
        sourceRoot,
        processName,
        qlconfigFile,
        logger,
      ),
  );
  return await getCombinedTracerConfig(codeql, config);
}

export function printPathFiltersWarning(
  config: configUtils.Config,
  logger: Logger,
) {
  // Index include/exclude/filters only work in javascript/python/ruby.
  // If any other languages are detected/configured then show a warning.
  if (
    (config.originalUserInput.paths?.length ||
      config.originalUserInput["paths-ignore"]?.length) &&
    !config.languages.every(isScannedLanguage)
  ) {
    logger.warning(
      'The "paths"/"paths-ignore" fields of the config only have effect for JavaScript, Python, and Ruby',
    );
  }
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
    languages.includes(Language.python) &&
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
  // We can't stub the fs module in tests, so we allow the caller to override the rmSync function
  // for testing.
  rmSync = fs.rmSync,
): void {
  if (
    fs.existsSync(config.dbLocation) &&
    (fs.statSync(config.dbLocation).isFile() ||
      fs.readdirSync(config.dbLocation).length)
  ) {
    logger.warning(
      `The database cluster directory ${config.dbLocation} must be empty. Attempting to clean it up.`,
    );
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
