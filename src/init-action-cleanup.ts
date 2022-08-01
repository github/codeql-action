import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import AdmZip from "adm-zip";
import del from "del";

import * as actionsUtil from "./actions-util";
import { dbIsFinalized } from "./analyze";
import { CODEQL_VERSION_NEW_TRACING, getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { getActionsLogger, Logger } from "./logging";
import {
  bundleDb,
  codeQlVersionAbove,
  doesDirectoryExist,
  getCodeQLDatabasePath,
} from "./util";

function listFolder(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      files.push(path.resolve(dir, entry.name));
    } else if (entry.isDirectory()) {
      files = files.concat(listFolder(path.resolve(dir, entry.name)));
    }
  }
  return files;
}

export async function uploadDatabaseBundleDebugArtifact(
  config: Config,
  logger: Logger
) {
  for (const language of config.languages) {
    if (!dbIsFinalized(config, language, logger)) {
      // Zip up files and upload directly.
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
      await actionsUtil.uploadDebugArtifacts(
        [databaseBundlePath],
        config.dbLocation,
        config.debugArtifactName
      );
      continue;
    }
    try {
      // Otherwise run `codeql database bundle` command.
      const toUpload: string[] = [];
      toUpload.push(
        await bundleDb(
          config,
          language,
          await getCodeQL(config.codeQLCmd),
          `${config.debugDatabaseName}-${language}`
        )
      );
      await actionsUtil.uploadDebugArtifacts(
        toUpload,
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

async function uploadLogsDebugArtifact(config: Config) {
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
  await actionsUtil.uploadDebugArtifacts(
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
      await actionsUtil.uploadDebugArtifacts(
        [compoundBuildTracerLogDirectory],
        config.tempDir,
        config.debugArtifactName
      );
    }
  }
}

async function uploadFinalLogsDebugArtifact(config: Config) {
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

async function run() {
  const logger = getActionsLogger();

  let config: Config | undefined = undefined;
  config = await getConfig(actionsUtil.getTemporaryDirectory(), logger);
  if (config === undefined) {
    throw new Error(
      "Config file could not be found at expected location. Has the 'init' action been called?"
    );
  }

  // Upload appropriate Actions artifacts for debugging
  if (config?.debugMode) {
    await uploadDatabaseBundleDebugArtifact(config, logger);
    await uploadLogsDebugArtifact(config);
    await uploadFinalLogsDebugArtifact(config);
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`init action cleanup failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
