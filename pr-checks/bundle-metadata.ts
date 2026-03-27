#!/usr/bin/env npx tsx

import * as fs from "node:fs/promises";

import { BUNDLE_METADATA_FILE } from "./config";

interface InputInfo {
  bytesInOutput: number;
}

type Inputs = Record<string, InputInfo>;

interface Output {
  bytes: number;
  inputs: Inputs;
}

interface Metadata {
  outputs: Output[];
}

function toMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

async function main() {
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
