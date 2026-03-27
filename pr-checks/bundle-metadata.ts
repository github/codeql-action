#!/usr/bin/env npx tsx

import * as fs from "node:fs/promises";

import { BUNDLE_METADATA_FILE } from "./config";

interface Output {
  bytes: number;
}

interface Metadata {
  outputs: Output[];
}

async function main() {
  const fileContents = await fs.readFile(BUNDLE_METADATA_FILE);
  const metadata = JSON.parse(String(fileContents)) as Metadata;

  for (const [outputFile, outputData] of Object.entries(
    metadata.outputs,
  ).reverse()) {
    console.info(
      `${outputFile}: ${(outputData.bytes / (1024 * 1024)).toFixed(2)}MB`,
    );
  }
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
