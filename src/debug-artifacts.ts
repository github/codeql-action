import * as fs from "fs";
import * as path from "path";

import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import AdmZip from "adm-zip";
import del from "del";

import { getRequiredInput } from "./actions-util";
import { dbIsFinalized } from "./analyze";
import { getCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { EnvVar } from "./environment";
import { Language } from "./languages";
import { Logger } from "./logging";
import {
  bundleDb,
  doesDirectoryExist,
  getCodeQLDatabasePath,
  listFolder,
} from "./util";

export function sanitizeArifactName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\\-]+/g, "");
}

export async function uploadAllAvailableDebugArtifacts(
  config: Config,
  logger: Logger,
) {
  const filesToUpload: string[] = [];

  const analyzeActionOutputDir = process.env[EnvVar.SARIF_RESULTS_OUTPUT_DIR];
  for (const lang of config.languages) {
    // Add any SARIF files, if they exist
    if (
      analyzeActionOutputDir !== undefined &&
      fs.existsSync(analyzeActionOutputDir) &&
      fs.lstatSync(analyzeActionOutputDir).isDirectory()
    ) {
      const sarifFile = path.resolve(analyzeActionOutputDir, `${lang}.sarif`);
      // Move SARIF to DB location so that they can be uploaded with the same root directory as the other artifacts.
      if (fs.existsSync(sarifFile)) {
        const sarifInDbLocation = path.resolve(
          config.dbLocation,
          `${lang}.sarif`,
        );
        fs.renameSync(sarifFile, sarifInDbLocation);
        filesToUpload.push(sarifInDbLocation);
      }
    }

    // Add any log files
    const databaseDirectory = getCodeQLDatabasePath(config, lang);
    const logsDirectory = path.resolve(databaseDirectory, "log");
    if (doesDirectoryExist(logsDirectory)) {
      filesToUpload.push(...listFolder(logsDirectory));
    }

    // Multilanguage tracing: there are additional logs in the root of the cluster
    const multiLanguageTracingLogsDirectory = path.resolve(
      config.dbLocation,
      "log",
    );
    if (doesDirectoryExist(multiLanguageTracingLogsDirectory)) {
      filesToUpload.push(...listFolder(multiLanguageTracingLogsDirectory));
    }

    // Add database bundle
    let databaseBundlePath: string;
    if (!dbIsFinalized(config, lang, logger)) {
      databaseBundlePath = await createPartialDatabaseBundle(config, lang);
    } else {
      databaseBundlePath = await createDatabaseBundleCli(config, lang);
    }
    filesToUpload.push(databaseBundlePath);
  }

  await uploadDebugArtifacts(
    filesToUpload,
    config.dbLocation,
    config.debugArtifactName,
  );
}

export async function uploadDebugArtifacts(
  toUpload: string[],
  rootDir: string,
  artifactName: string,
) {
  if (toUpload.length === 0) {
    return;
  }
  let suffix = "";
  const matrix = getRequiredInput("matrix");
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

  try {
    await artifact.create().uploadArtifact(
      sanitizeArifactName(`${artifactName}${suffix}`),
      toUpload.map((file) => path.normalize(file)),
      path.normalize(rootDir),
      {
        continueOnError: true,
        // ensure we don't keep the debug artifacts around for too long since they can be large.
        retentionDays: 7,
      },
    );
  } catch (e) {
    // A failure to upload debug artifacts should not fail the entire action.
    core.warning(`Failed to upload debug artifacts: ${e}`);
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
  // Otherwise run `codeql database bundle` command.
  const databaseBundlePath = await bundleDb(
    config,
    language,
    await getCodeQL(config.codeQLCmd),
    `${config.debugDatabaseName}-${language}`,
  );
  return databaseBundlePath;
}
