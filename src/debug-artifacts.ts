import * as fs from "fs";
import * as path from "path";

import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import AdmZip from "adm-zip";
import del from "del";

import { getRequiredInput } from "./actions-util";
import { dbIsFinalized } from "./analyze";
import { CODEQL_VERSION_NEW_TRACING, getCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { Language } from "./languages";
import { Logger } from "./logging";
import {
  bundleDb,
  codeQlVersionAbove,
  doesDirectoryExist,
  getCodeQLDatabasePath,
  listFolder,
} from "./util";

export function sanitizeArifactName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\\-]+/g, "");
}

export async function uploadDebugArtifacts(
  toUpload: string[],
  rootDir: string,
  artifactName: string
) {
  if (toUpload.length === 0) {
    return;
  }
  let suffix = "";
  const matrix = getRequiredInput("matrix");
  if (matrix) {
    try {
      for (const [, matrixVal] of Object.entries(JSON.parse(matrix)).sort())
        suffix += `-${matrixVal}`;
    } catch (e) {
      core.info(
        "Could not parse user-specified `matrix` input into JSON. The debug artifact will not be named with the user's `matrix` input."
      );
    }
  }
  await artifact.create().uploadArtifact(
    sanitizeArifactName(`${artifactName}${suffix}`),
    toUpload.map((file) => path.normalize(file)),
    path.normalize(rootDir)
  );
}

export async function uploadSarifDebugArtifact(
  config: Config,
  outputDir: string
) {
  if (!doesDirectoryExist(outputDir)) {
    return;
  }

  let toUpload: string[] = [];
  for (const lang of config.languages) {
    const sarifFile = path.resolve(outputDir, `${lang}.sarif`);
    if (fs.existsSync(sarifFile)) {
      toUpload = toUpload.concat(sarifFile);
    }
  }
  await uploadDebugArtifacts(toUpload, outputDir, config.debugArtifactName);
}

export async function printDebugLogs(config: Config) {
  core.info("Debug mode is on. Printing CodeQL debug logs...");
  for (const language of config.languages) {
    const databaseDirectory = getCodeQLDatabasePath(config, language);
    const logsDirectory = path.join(databaseDirectory, "log");
    if (!doesDirectoryExist(logsDirectory)) {
      core.info(`Directory ${logsDirectory} does not exist.`);
      continue; // Skip this language database.
    }

    const walkLogFiles = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      if (entries.length === 0) {
        core.info(`No debug logs found at directory ${logsDirectory}.`);
      }
      for (const entry of entries) {
        if (entry.isFile()) {
          core.startGroup(`CodeQL Debug Logs - ${language} - ${entry.name}`);
          process.stdout.write(fs.readFileSync(path.resolve(dir, entry.name)));
          core.endGroup();
        } else if (entry.isDirectory()) {
          walkLogFiles(path.resolve(dir, entry.name));
        }
      }
    };
    walkLogFiles(logsDirectory);
  }
}

export async function uploadLogsDebugArtifact(config: Config) {
  const codeql = await getCodeQL(config.codeQLCmd);

  let toUpload: string[] = [];
  for (const language of config.languages) {
    const databaseDirectory = getCodeQLDatabasePath(config, language);
    const logsDirectory = path.resolve(databaseDirectory, "log");
    if (doesDirectoryExist(logsDirectory)) {
      toUpload = toUpload.concat(listFolder(logsDirectory));
    }
  }

  if (await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING)) {
    // Multilanguage tracing: there are additional logs in the root of the cluster
    const multiLanguageTracingLogsDirectory = path.resolve(
      config.dbLocation,
      "log"
    );
    if (doesDirectoryExist(multiLanguageTracingLogsDirectory)) {
      toUpload = toUpload.concat(listFolder(multiLanguageTracingLogsDirectory));
    }
  }
  await uploadDebugArtifacts(
    toUpload,
    config.dbLocation,
    config.debugArtifactName
  );

  // Before multi-language tracing, we wrote a compound-build-tracer.log in the temp dir
  if (!(await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING))) {
    const compoundBuildTracerLogDirectory = path.resolve(
      config.tempDir,
      "compound-build-tracer.log"
    );
    if (doesDirectoryExist(compoundBuildTracerLogDirectory)) {
      await uploadDebugArtifacts(
        [compoundBuildTracerLogDirectory],
        config.tempDir,
        config.debugArtifactName
      );
    }
  }
}

/**
 * If a database has not been finalized, we cannot run the `codeql database bundle`
 * command in the CLI because it will return an error. Instead we directly zip
 * all files in the database folder and upload it as an artifact.
 */
async function uploadPartialDatabaseBundle(config: Config, language: Language) {
  const databasePath = getCodeQLDatabasePath(config, language);
  const databaseBundlePath = path.resolve(
    config.dbLocation,
    `${config.debugDatabaseName}-${language}-partial.zip`
  );
  core.info(
    `${config.debugDatabaseName}-${language} is not finalized. Uploading partial database bundle at ${databaseBundlePath}...`
  );
  // See `bundleDb` for explanation behind deleting existing db bundle.
  if (fs.existsSync(databaseBundlePath)) {
    await del(databaseBundlePath, { force: true });
  }
  const zip = new AdmZip();
  zip.addLocalFolder(databasePath);
  zip.writeZip(databaseBundlePath);
  await uploadDebugArtifacts(
    [databaseBundlePath],
    config.dbLocation,
    config.debugArtifactName
  );
}

export async function uploadDatabaseBundleDebugArtifact(
  config: Config,
  logger: Logger
) {
  for (const language of config.languages) {
    if (!dbIsFinalized(config, language, logger)) {
      await uploadPartialDatabaseBundle(config, language);
      continue;
    }
    try {
      // Otherwise run `codeql database bundle` command.
      const bundlePath = await bundleDb(
        config,
        language,
        await getCodeQL(config.codeQLCmd),
        `${config.debugDatabaseName}-${language}`
      );
      await uploadDebugArtifacts(
        [bundlePath],
        config.dbLocation,
        config.debugArtifactName
      );
    } catch (error) {
      core.info(
        `Failed to upload database debug bundles for ${config.debugDatabaseName}-${language}: ${error}`
      );
    }
  }
}
