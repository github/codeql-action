/**
 * This file is the entry point for the `post:` hook of `upload-sarif-action.yml`.
 * It will run after the all steps in this job, in reverse order in relation to
 * other `post:` hooks.
 */
import {
  ActionName,
  runInActions,
  type Action,
  type ActionState,
} from "./action-common";
import { getGitHubVersion } from "./api-client";
import * as debugArtifacts from "./debug-artifacts";
import { EnvVar } from "./environment";
import { withGroup } from "./logging";
import { checkGitHubVersionInRange, getErrorMessage } from "./util";

/**
 * The main functionality of the `upload-sarif` post-action is implemented by this function.
 * This is called once by {@link runInActions} after it is called in {@link runWrapper}.
 */
export async function run(action: ActionState<["Logger", "Env", "Actions"]>) {
  // To capture errors appropriately, keep as much code within the try-catch as
  // possible, and only use safe functions outside.
  const logger = action.logger;

  try {
    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    // Upload SARIF artifacts if we determine that this is a third-party analysis run.
    // For first-party runs, this artifact will be uploaded in the `analyze-post` step.
    if (action.env.getOptional(EnvVar.INIT_ACTION_HAS_RUN) !== "true") {
      if (gitHubVersion.type === undefined) {
        logger.warning(
          `Did not upload debug artifacts because cannot determine the GitHub variant running.`,
        );
        return;
      }
      await withGroup("Uploading combined SARIF debug artifact", () =>
        debugArtifacts.uploadCombinedSarifArtifacts(logger, gitHubVersion.type),
      );
    }
  } catch (error) {
    action.actions.setFailed(
      `upload-sarif post-action step failed: ${getErrorMessage(error)}`,
    );
  }
}

/** Defines the `upload-sarif` post-action. */
const uploadSarifPostAction: Action = {
  name: ActionName.UploadSarifPost,
  run,
};

/** The main entry point for the `upload-sarif` post-action. */
export async function runWrapper() {
  await runInActions(uploadSarifPostAction);
}
