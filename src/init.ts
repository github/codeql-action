import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";
import * as yaml from "js-yaml";

import { getOptionalInput, isSelfHostedRunner } from "./actions-util";
import { GitHubApiDetails } from "./api-client";
import { CodeQL, setupCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { CodeQLDefaultVersionInfo, FeatureEnablement } from "./feature-flags";
import { KnownLanguage, Language } from "./languages";
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
  inputs: configUtils.InitConfigInputs,
): Promise<configUtils.Config> {
  return await withGroupAsync("Load language configuration", async () => {
    return await configUtils.initConfig(inputs);
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
    languages.includes(KnownLanguage.python) &&
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
