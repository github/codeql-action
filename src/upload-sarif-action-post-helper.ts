import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";

export async function run(
  uploadDebugArtifacts: (
    toUpload: string[],
    rootDir: string,
    artifactName: string,
  ) => Promise<void>,
) {
  const tempDir = actionsUtil.getTemporaryDirectory();

  // Upload Actions SARIF artifacts for debugging
  if (core.isDebug()) {
    core.info(
      "Debug mode is on. Uploading available combined SARIF files as Actions debugging artifact...",
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

    if (toUpload.length > 0) {
      await uploadDebugArtifacts(
        toUpload,
        baseTempDir,
        "upload-debug-artifacts",
      );
    }
  }
}
