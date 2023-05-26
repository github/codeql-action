import * as core from "@actions/core";

import {
  createStatusReportBase,
  getOptionalInput,
  getRequiredInput,
  getTemporaryDirectory,
  sendStatusReport,
} from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { Features } from "./feature-flags";
import { initCodeQL } from "./init";
import { Language, resolveAlias } from "./languages";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { runResolveBuildEnvironment } from "./resolve-environment";
import {
  checkForTimeout,
  checkGitHubVersionInRange,
  getRequiredEnvParam,
  wrapError,
} from "./util";
import { validateWorkflow } from "./workflow";

const actionName = "resolve-environment";

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  const language: Language = resolveAlias(getRequiredInput("language"));

  const apiDetails = {
    auth: getRequiredInput("token"),
    externalRepoAuth: getOptionalInput("external-repository-token"),
    url: getRequiredEnvParam("GITHUB_SERVER_URL"),
    apiURL: getRequiredEnvParam("GITHUB_API_URL"),
  };

  const repositoryNwo = parseRepositoryNwo(
    getRequiredEnvParam("GITHUB_REPOSITORY")
  );

  try {
    const workflowErrors = await validateWorkflow(logger);

    if (
      !(await sendStatusReport(
        await createStatusReportBase(
          actionName,
          "starting",
          startedAt,
          workflowErrors
        )
      ))
    ) {
      return;
    }

    const gitHubVersion = await getGitHubVersion();
    checkGitHubVersionInRange(gitHubVersion, logger);

    const features = new Features(
      gitHubVersion,
      repositoryNwo,
      getTemporaryDirectory(),
      logger
    );

    const codeQLDefaultVersionInfo = await features.getDefaultCliVersion(
      gitHubVersion.type
    );

    const initCodeQLResult = await initCodeQL(
      getOptionalInput("tools"),
      apiDetails,
      getTemporaryDirectory(),
      gitHubVersion.type,
      codeQLDefaultVersionInfo,
      logger
    );

    const workingDirectory = getOptionalInput("working-directory");
    if (workingDirectory) {
      logger.info(
        `Changing autobuilder working directory to ${workingDirectory}`
      );
      process.chdir(workingDirectory);
    }

    const result = await runResolveBuildEnvironment(
      initCodeQLResult.codeql.getPath(),
      logger,
      language
    );
    core.setOutput("environment", result);
  } catch (unwrappedError) {
    const error = wrapError(unwrappedError);
    core.setFailed(error.message);
    await sendStatusReport(
      await createStatusReportBase(
        actionName,
        "aborted",
        startedAt,
        error.message,
        error.stack
      )
    );
    return;
  }
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`${actionName} action failed: ${wrapError(error).message}`);
  }
  await checkForTimeout();
}

void runWrapper();
