/**
 * This file is the entry point for the `post:` hook of `analyze-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import * as fs from "fs";

import {
  ActionName,
  runInActions,
  type Action,
  type ActionState,
} from "./action-common";
import * as actionsUtil from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { getConfig } from "./config-utils";
import * as debugArtifacts from "./debug-artifacts";
import {
  getCsharpTempDependencyDir,
  getJavaTempDependencyDir,
} from "./dependency-caching";
import { EnvVar } from "./environment";
import { checkGitHubVersionInRange, getErrorMessage } from "./util";

/**
 * The main functionality of the `analyze` post-action is implemented by this function.
 * This is called once by {@link runInActions} after it is called in {@link runWrapper}.
 */
export async function run(action: ActionState<["Logger", "Env", "Actions"]>) {
  // To capture errors appropriately, keep as much code within the try-catch as
  // possible, and only use safe functions outside.
  const logger = action.logger;

  try {
    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    // Upload SARIF artifacts if we determine that this is a first-party analysis run.
    // For third-party runs, this artifact will be uploaded in the `upload-sarif-post` step.
    if (action.env.getOptional(EnvVar.INIT_ACTION_HAS_RUN) === "true") {
      const config = await getConfig(
        actionsUtil.getTemporaryDirectory(),
        logger,
      );
      if (config !== undefined) {
        await debugArtifacts.uploadCombinedSarifArtifacts(
          logger,
          config.gitHubVersion.type,
        );
      }
    }

    // If we analysed Java or C# in build-mode: none, we may have downloaded dependencies
    // to the temp directory. Clean these up so they don't persist unnecessarily
    // long on self-hosted runners.
    const tempDependencyDirs = [
      getJavaTempDependencyDir(),
      getCsharpTempDependencyDir(),
    ];
    for (const tempDependencyDir of tempDependencyDirs) {
      if (fs.existsSync(tempDependencyDir)) {
        try {
          fs.rmSync(tempDependencyDir, { recursive: true });
        } catch (error) {
          logger.info(
            `Failed to remove temporary dependencies directory: ${getErrorMessage(error)}`,
          );
        }
      }
    }
  } catch (error) {
    action.actions.setFailed(
      `analyze post-action step failed: ${getErrorMessage(error)}`,
    );
  }
}

/** Defines the `analyze` post-action. */
const analyzePostAction: Action = {
  name: ActionName.AnalyzePost,
  run,
};

/** The main entry point for the `analyze` post-action. */
export async function runWrapper() {
  await runInActions(analyzePostAction);
}
