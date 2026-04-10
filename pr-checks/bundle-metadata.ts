#!/usr/bin/env npx tsx

import * as fs from "node:fs/promises";
import { parseArgs, ParseArgsConfig } from "node:util";

import * as exec from "@actions/exec";

import {
  ApiClient,
  CODEQL_ACTION_REPO,
  getApiClient,
  TOKEN_OPTION_CONFIG,
} from "./api-client";
import { BASELINE_BUNDLE_METADATA_FILE, BUNDLE_METADATA_FILE } from "./config";

const optionsConfig = {
  ...TOKEN_OPTION_CONFIG,
  branch: {
    type: "string",
    default: "main",
  },
  runner: {
    type: "string",
    default: "macos-latest",
  },
  "node-version": {
    type: "string",
    default: "24",
  },
} satisfies ParseArgsConfig["options"];

function parseOptions() {
  const { values: options } = parseArgs({
    options: optionsConfig,
  });

  return options;
}

type Options = ReturnType<typeof parseOptions>;

interface InputInfo {
  bytesInOutput: number;
}

type Inputs = Record<string, InputInfo>;

interface Output {
  bytes: number;
  inputs: Inputs;
}

interface Metadata {
  outputs: Record<string, Output>;
}

function toMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

async function getBaselineFrom(client: ApiClient, options: Options) {
  const workflowRun = await client.rest.actions.listWorkflowRuns({
    ...CODEQL_ACTION_REPO,
    branch: options.branch,
    workflow_id: "pr-checks.yml",
    status: "success",
    per_page: 1,
    event: "push",
  });

  if (workflowRun.data.total_count === 0) {
    throw new Error(
      `Expected to find a 'pr-checks.yml' run for '${options.branch}', but found none.`,
    );
  }

  const expectedArtifactName = `bundle-metadata-${options.runner}-${options["node-version"]}`;
  const artifacts = await client.rest.actions.listWorkflowRunArtifacts({
    ...CODEQL_ACTION_REPO,
    run_id: workflowRun.data.workflow_runs[0].id,
    name: expectedArtifactName,
  });

  if (artifacts.data.total_count === 0) {
    throw new Error(
      `Expected to find an artifact named '${expectedArtifactName}', but found none.`,
    );
  }

  const downloadInfo = await client.rest.actions.downloadArtifact({
    ...CODEQL_ACTION_REPO,
    artifact_id: artifacts.data.artifacts[0].id,
    archive_format: "zip",
  });

  // This works fine for us with our version of Octokit, so we don't need to
  // worry about over-complicating this script and handle other possibilities.
  if (downloadInfo.data instanceof ArrayBuffer) {
    const archivePath = `${expectedArtifactName}.zip`;
    await fs.writeFile(archivePath, Buffer.from(downloadInfo.data));

    console.info(`Extracting zip file: ${archivePath}`);
    await exec.exec("unzip", ["-o", archivePath, "-d", "."]);

    // We no longer need the archive after unzipping it.
    await fs.rm(archivePath);

    // Check that we have the expected file.
    try {
      await fs.stat(BASELINE_BUNDLE_METADATA_FILE);
    } catch (err) {
      throw new Error(
        `Expected '${BASELINE_BUNDLE_METADATA_FILE}' to have been extracted, but it does not exist: ${err}`,
      );
    }

    const baselineData = await fs.readFile(BASELINE_BUNDLE_METADATA_FILE);
    return JSON.parse(String(baselineData)) as Metadata;
  } else {
    throw new Error("Expected to receive artifact data, but didn't.");
  }
}

async function main() {
  const options = parseOptions();

  if (options.token === undefined) {
    throw new Error("Missing --token");
  }

  // Initialise the API client.
  const client = getApiClient(options.token);
  const baselineMetadata = await getBaselineFrom(client, options);

  const fileContents = await fs.readFile(BUNDLE_METADATA_FILE);
  const metadata = JSON.parse(String(fileContents)) as Metadata;

  for (const [outputFile, outputData] of Object.entries(
    metadata.outputs,
  ).reverse()) {
    console.info(`${outputFile}: ${toMB(outputData.bytes)}`);

    for (const [inputName, inputData] of Object.entries(outputData.inputs)) {
      // Ignore any inputs that make up less than 5% of the output.
      const percentage = (inputData.bytesInOutput / outputData.bytes) * 100.0;
      if (percentage < 5.0) continue;

      console.info(`  ${inputName}: ${toMB(inputData.bytesInOutput)}`);
    }
  }
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
