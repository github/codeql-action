import * as fs from "fs";
import * as path from "path";

import * as artifact from "@actions/artifact";
import * as artifactLegacy from "@actions/artifact-legacy";
import * as core from "@actions/core";
import AdmZip from "adm-zip";
import del from "del";

import { getOptionalInput, getTemporaryDirectory } from "./actions-util";
import { dbIsFinalized } from "./analyze";
import { getCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { EnvVar } from "./environment";
import { Language } from "./languages";
import { Logger, withGroup } from "./logging";
import {
  isSafeArtifactUpload,
  SafeArtifactUploadVersion,
} from "./tools-features";
import {
  bundleDb,
  doesDirectoryExist,
  getCodeQLDatabasePath,
  getErrorMessage,
  GitHubVariant,
  listFolder,
} from "./util";

export function sanitizeArtifactName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\\-]+/g, "");
}

/**
 * Upload Actions SARIF artifacts for debugging when CODEQL_ACTION_DEBUG_COMBINED_SARIF
 * environment variable is set
 */
export async function uploadCombinedSarifArtifacts(
  logger: Logger,
  gitHubVariant: GitHubVariant,
  codeQlVersion: string | undefined,
) {
  const tempDir = getTemporaryDirectory();

  // Upload Actions SARIF artifacts for debugging when environment variable is set
  if (process.env["CODEQL_ACTION_DEBUG_COMBINED_SARIF"] === "true") {
    await withGroup("Uploading combined SARIF debug artifact", async () => {
      logger.info(
        "Uploading available combined SARIF files as Actions debugging artifact...",
      );

      const baseTempDir = path.resolve(tempDir, "combined-sarif");

      const toUpload: string[] = [];

      if (fs.existsSync(baseTempDir)) {
        const outputDirs = fs.readdirSync(baseTempDir);

        for (const outputDir of outputDirs) {
          const sarifFiles = fs
            .readdirSync(path.resolve(baseTempDir, outputDir))
            .filter((f) => f.endsWith(".sarif"));

          for (const sarifFile of sarifFiles) {
            toUpload.push(path.resolve(baseTempDir, outputDir, sarifFile));
          }
        }
      }

      try {
        await uploadDebugArtifacts(
          logger,
          toUpload,
          baseTempDir,
          "combined-sarif-artifacts",
          gitHubVariant,
          codeQlVersion,
        );
      } catch (e) {
        logger.warning(
          `Failed to upload combined SARIF files as Actions debugging artifact. Reason: ${getErrorMessage(
            e,
          )}`,
        );
      }
    });
  }
}

/**
 * Try to prepare a SARIF result debug artifact for the given language.
 *
 * @return The path to that debug artifact, or undefined if an error occurs.
 */
function tryPrepareSarifDebugArtifact(
  config: Config,
  language: Language,
  logger: Logger,
): string | undefined {
  try {
    const analyzeActionOutputDir = process.env[EnvVar.SARIF_RESULTS_OUTPUT_DIR];
    if (
      analyzeActionOutputDir !== undefined &&
      fs.existsSync(analyzeActionOutputDir) &&
      fs.lstatSync(analyzeActionOutputDir).isDirectory()
    ) {
      const sarifFile = path.resolve(
        analyzeActionOutputDir,
        `${language}.sarif`,
      );
      // Move SARIF to DB location so that they can be uploaded with the same root directory as the other artifacts.
      if (fs.existsSync(sarifFile)) {
        const sarifInDbLocation = path.resolve(
          config.dbLocation,
          `${language}.sarif`,
        );
        fs.copyFileSync(sarifFile, sarifInDbLocation);
        return sarifInDbLocation;
      }
    }
  } catch (e) {
    logger.warning(
      `Failed to find SARIF results path for ${language}. Reason: ${getErrorMessage(
        e,
      )}`,
    );
  }
  return undefined;
}

/**
 * Try to bundle the database for the given language.
 *
 * @return The path to the database bundle, or undefined if an error occurs.
 */
async function tryBundleDatabase(
  config: Config,
  language: Language,
  logger: Logger,
): Promise<string | undefined> {
  try {
    if (dbIsFinalized(config, language, logger)) {
      try {
        return await createDatabaseBundleCli(config, language);
      } catch (e) {
        logger.warning(
          `Failed to bundle database for ${language} using the CLI. ` +
            `Falling back to a partial bundle. Reason: ${getErrorMessage(e)}`,
        );
      }
    }
    return await createPartialDatabaseBundle(config, language);
  } catch (e) {
    logger.warning(
      `Failed to bundle database for ${language}. Reason: ${getErrorMessage(
        e,
      )}`,
    );
    return undefined;
  }
}

/**
 * Attempt to upload all available debug artifacts.
 *
 * Logs and suppresses any errors that occur.
 */
export async function tryUploadAllAvailableDebugArtifacts(
  config: Config,
  logger: Logger,
  codeQlVersion: string | undefined,
) {
  const filesToUpload: string[] = [];
  try {
    for (const language of config.languages) {
      await withGroup(`Uploading debug artifacts for ${language}`, async () => {
        logger.info("Preparing SARIF result debug artifact...");
        const sarifResultDebugArtifact = tryPrepareSarifDebugArtifact(
          config,
          language,
          logger,
        );
        if (sarifResultDebugArtifact) {
          filesToUpload.push(sarifResultDebugArtifact);
          logger.info("SARIF result debug artifact ready for upload.");
        }

        logger.info("Preparing database logs debug artifact...");
        const databaseDirectory = getCodeQLDatabasePath(config, language);
        const logsDirectory = path.resolve(databaseDirectory, "log");
        if (doesDirectoryExist(logsDirectory)) {
          filesToUpload.push(...listFolder(logsDirectory));
          logger.info("Database logs debug artifact ready for upload.");
        }

        // Multilanguage tracing: there are additional logs in the root of the cluster
        logger.info("Preparing database cluster logs debug artifact...");
        const multiLanguageTracingLogsDirectory = path.resolve(
          config.dbLocation,
          "log",
        );
        if (doesDirectoryExist(multiLanguageTracingLogsDirectory)) {
          filesToUpload.push(...listFolder(multiLanguageTracingLogsDirectory));
          logger.info("Database cluster logs debug artifact ready for upload.");
        }

        // Add database bundle
        logger.info("Preparing database bundle debug artifact...");
        const databaseBundle = await tryBundleDatabase(
          config,
          language,
          logger,
        );
        if (databaseBundle) {
          filesToUpload.push(databaseBundle);
          logger.info("Database bundle debug artifact ready for upload.");
        }
      });
    }
  } catch (e) {
    logger.warning(
      `Failed to prepare debug artifacts. Reason: ${getErrorMessage(e)}`,
    );
    return;
  }

  try {
    await withGroup("Uploading debug artifacts", async () =>
      uploadDebugArtifacts(
        logger,
        filesToUpload,
        config.dbLocation,
        config.debugArtifactName,
        config.gitHubVersion.type,
        codeQlVersion,
      ),
    );
  } catch (e) {
    logger.warning(
      `Failed to upload debug artifacts. Reason: ${getErrorMessage(e)}`,
    );
  }
}

export async function uploadDebugArtifacts(
  logger: Logger,
  toUpload: string[],
  rootDir: string,
  artifactName: string,
  ghVariant: GitHubVariant,
  codeQlVersion: string | undefined,
): Promise<
  | "no-artifacts-to-upload"
  | "upload-successful"
  | "upload-failed"
  | "upload-not-supported"
> {
  if (toUpload.length === 0) {
    return "no-artifacts-to-upload";
  }
  const uploadSupported = isSafeArtifactUpload(codeQlVersion);

  if (!uploadSupported) {
    core.info(
      `Skipping debug artifact upload because the current CLI does not support safe upload. Please upgrade to CLI v${SafeArtifactUploadVersion} or later.`,
    );
    return "upload-not-supported";
  }

  let suffix = "";
  const matrix = getOptionalInput("matrix");
  if (matrix) {
    try {
      for (const [, matrixVal] of Object.entries(
        JSON.parse(matrix) as any[][],
      ).sort())
        suffix += `-${matrixVal}`;
    } catch {
      core.info(
        "Could not parse user-specified `matrix` input into JSON. The debug artifact will not be named with the user's `matrix` input.",
      );
    }
  }

  const artifactUploader = await getArtifactUploaderClient(logger, ghVariant);

  try {
    await artifactUploader.uploadArtifact(
      sanitizeArtifactName(`${artifactName}${suffix}`),
      toUpload.map((file) => path.normalize(file)),
      path.normalize(rootDir),
      {
        // ensure we don't keep the debug artifacts around for too long since they can be large.
        retentionDays: 7,
      },
    );
    return "upload-successful";
  } catch (e) {
    // A failure to upload debug artifacts should not fail the entire action.
    core.warning(`Failed to upload debug artifacts: ${e}`);
    return "upload-failed";
  }
}

// `@actions/artifact@v2` is not yet supported on GHES so the legacy version of the client will be used on GHES
// until it is supported. We also use the legacy version of the client if the feature flag is disabled.
// The feature flag is named `ArtifactV4Upgrade` to reduce customer confusion; customers are primarily affected by
// `actions/download-artifact`, whose upgrade to v4 must be accompanied by the `@actions/artifact@v2` upgrade.
export async function getArtifactUploaderClient(
  logger: Logger,
  ghVariant: GitHubVariant,
): Promise<artifact.ArtifactClient | artifactLegacy.ArtifactClient> {
  if (ghVariant === GitHubVariant.GHES) {
    logger.info(
      "Debug artifacts can be consumed with `actions/download-artifact@v3` because the `v4` version is not yet compatible on GHES.",
    );
    return artifactLegacy.create();
  } else {
    logger.info(
      "Debug artifacts can be consumed with `actions/download-artifact@v4`.",
    );
    return new artifact.DefaultArtifactClient();
  }
}

/**
 * If a database has not been finalized, we cannot run the `codeql database bundle`
 * command in the CLI because it will return an error. Instead we directly zip
 * all files in the database folder and return the path.
 */
async function createPartialDatabaseBundle(
  config: Config,
  language: Language,
): Promise<string> {
  const databasePath = getCodeQLDatabasePath(config, language);
  const databaseBundlePath = path.resolve(
    config.dbLocation,
    `${config.debugDatabaseName}-${language}-partial.zip`,
  );
  core.info(
    `${config.debugDatabaseName}-${language} is not finalized. Uploading partial database bundle at ${databaseBundlePath}...`,
  );
  // See `bundleDb` for explanation behind deleting existing db bundle.
  if (fs.existsSync(databaseBundlePath)) {
    await del(databaseBundlePath, { force: true });
  }
  const zip = new AdmZip();
  zip.addLocalFolder(databasePath);
  zip.writeZip(databaseBundlePath);
  return databaseBundlePath;
}

/**
 * Runs `codeql database bundle` command and returns the path.
 */
async function createDatabaseBundleCli(
  config: Config,
  language: Language,
): Promise<string> {
  const databaseBundlePath = await bundleDb(
    config,
    language,
    await getCodeQL(config.codeQLCmd),
    `${config.debugDatabaseName}-${language}`,
  );
  return databaseBundlePath;
}
