import * as path from "path";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import * as configUtils from "./config-utils";
import { getCombinedSarifDebugArtifacts } from "./debug-artifacts";
import { EnvVar } from "./environment";
import { GitHubVariant } from "./util";

export async function uploadArtifacts(
  uploadDebugArtifacts: (
    toUpload: string[],
    rootDir: string,
    artifactName: string,
    ghVariant: GitHubVariant | undefined,
  ) => Promise<void>,
) {
  // Upload debug artifacts here only if this is third-party analysis.
  if (process.env[EnvVar.INIT_ACTION_HAS_RUN] !== "true") {
    const tempDir = actionsUtil.getTemporaryDirectory();
    const baseTempDir = path.resolve(tempDir, "combined-sarif");

    const combinedSarifDebugArtifacts =
      getCombinedSarifDebugArtifacts(baseTempDir);
    if (combinedSarifDebugArtifacts.length > 0) {
      const config = await configUtils.getConfig(tempDir, core);
      await uploadDebugArtifacts(
        combinedSarifDebugArtifacts,
        baseTempDir,
        "upload-debug-artifacts",
        config?.gitHubVersion.type,
      );
    }
  }

  // const tempDir = actionsUtil.getTemporaryDirectory();

  // // Upload Actions SARIF artifacts for debugging when environment variable is set
  // if (process.env["CODEQL_ACTION_DEBUG_COMBINED_SARIF"] === "true") {
  //   core.info(
  //     "Uploading available combined SARIF files as Actions debugging artifact...",
  //   );

  //   const baseTempDir = path.resolve(tempDir, "combined-sarif");

  //   const toUpload: string[] = [];

  //   if (fs.existsSync(baseTempDir)) {
  //     const outputDirs = fs.readdirSync(baseTempDir);

  //     for (const outputDir of outputDirs) {
  //       const sarifFiles = fs
  //         .readdirSync(path.resolve(baseTempDir, outputDir))
  //         .filter((f) => f.endsWith(".sarif"));

  //       for (const sarifFile of sarifFiles) {
  //         toUpload.push(path.resolve(baseTempDir, outputDir, sarifFile));
  //       }
  //     }
  //   }

  //   const config = await configUtils.getConfig(
  //     actionsUtil.getTemporaryDirectory(),
  //     core,
  //   );

  //   if (toUpload.length > 0) {
  //     await uploadDebugArtifacts(
  //       toUpload,
  //       baseTempDir,
  //       "upload-debug-artifacts",
  //       config?.gitHubVersion.type,
  //     );
  //   }
  // }
}
