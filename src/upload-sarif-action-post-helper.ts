import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import * as configUtils from "./config-utils";
import { GitHubVariant } from "./util";

export async function uploadArtifacts(
  uploadDebugArtifacts: (
    toUpload: string[],
    rootDir: string,
    artifactName: string,
    ghVariant: GitHubVariant | undefined,
  ) => Promise<void>,
) {
  const tempDir = actionsUtil.getTemporaryDirectory();

  // Upload Actions SARIF artifacts for debugging when environment variable is set
  if (process.env["CODEQL_ACTION_DEBUG_COMBINED_SARIF"] === "true") {
    core.info(
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

    const config = await configUtils.getConfig(
      actionsUtil.getTemporaryDirectory(),
      core,
    );

    if (toUpload.length > 0) {
      await uploadDebugArtifacts(
        toUpload,
        baseTempDir,
        "upload-debug-artifacts",
        config?.gitHubVersion.type,
      );
    }
  }
}
