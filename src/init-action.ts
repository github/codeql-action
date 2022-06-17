import * as path from "path";

import * as core from "@actions/core";

import {
  createStatusReportBase,
  getActionsStatus,
  getOptionalInput,
  getRequiredInput,
  getTemporaryDirectory,
  sendStatusReport,
  StatusReportBase,
  validateWorkflow,
} from "./actions-util";
import { getGitHubVersionActionsOnly } from "./api-client";
import { CodeQL, CODEQL_VERSION_NEW_TRACING } from "./codeql";
import * as configUtils from "./config-utils";
import { GitHubFeatureFlags } from "./feature-flags";
import {
  initCodeQL,
  initConfig,
  injectWindowsTracer,
  installPythonDeps,
  runInit,
} from "./init";
import { Language } from "./languages";
import { getActionsLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import {
  getRequiredEnvParam,
  initializeEnvironment,
  Mode,
  checkGitHubVersionInRange,
  codeQlVersionAbove,
  enrichEnvironment,
  getMemoryFlagValue,
  getThreadsFlagValue,
  DEFAULT_DEBUG_ARTIFACT_NAME,
  DEFAULT_DEBUG_DATABASE_NAME,
  getMlPoweredJsQueriesStatus,
  checkActionVersion,
} from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

interface InitSuccessStatusReport extends StatusReportBase {
  /** Comma-separated list of languages where the default queries are disabled. */
  disable_default_queries: string;
  /**
   * Comma-separated list of languages that analysis was run for.
   *
   * This may be from the workflow file or may be calculated from repository contents
   */
  languages: string;
  /** Comma-separated list of paths, from the 'paths' config field. */
  paths: string;
  /** Comma-separated list of paths, from the 'paths-ignore' config field. */
  paths_ignore: string;
  /** Comma-separated list of queries sources, from the 'queries' config field or workflow input. */
  queries: string;
  /** Value given by the user as the "tools" input. */
  tools_input: string;
  /** Version of the bundle used. */
  tools_resolved_version: string;
  /** Comma-separated list of languages specified explicitly in the workflow file. */
  workflow_languages: string;
}

async function sendSuccessStatusReport(
  startedAt: Date,
  config: configUtils.Config,
  toolsVersion: string
) {
  const statusReportBase = await createStatusReportBase(
    "init",
    "success",
    startedAt
  );

  const languages = config.languages.join(",");
  const workflowLanguages = getOptionalInput("languages");
  const paths = (config.originalUserInput.paths || []).join(",");
  const pathsIgnore = (config.originalUserInput["paths-ignore"] || []).join(
    ","
  );
  const disableDefaultQueries = config.originalUserInput[
    "disable-default-queries"
  ]
    ? languages
    : "";

  const queries: string[] = [];
  let queriesInput = getOptionalInput("queries")?.trim();
  if (queriesInput === undefined || queriesInput.startsWith("+")) {
    queries.push(
      ...(config.originalUserInput.queries || []).map((q) => q.uses)
    );
  }
  if (queriesInput !== undefined) {
    queriesInput = queriesInput.startsWith("+")
      ? queriesInput.slice(1)
      : queriesInput;
    queries.push(...queriesInput.split(","));
  }

  const statusReport: InitSuccessStatusReport = {
    ...statusReportBase,
    disable_default_queries: disableDefaultQueries,
    languages,
    ml_powered_javascript_queries: getMlPoweredJsQueriesStatus(config),
    paths,
    paths_ignore: pathsIgnore,
    queries: queries.join(","),
    tools_input: getOptionalInput("tools") || "",
    tools_resolved_version: toolsVersion,
    workflow_languages: workflowLanguages || "",
  };

  await sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  initializeEnvironment(Mode.actions, pkg.version);
  await checkActionVersion(pkg.version);

  let config: configUtils.Config;
  let codeql: CodeQL;
  let toolsVersion: string;

  const apiDetails = {
    auth: getRequiredInput("token"),
    externalRepoAuth: getOptionalInput("external-repository-token"),
    url: getRequiredEnvParam("GITHUB_SERVER_URL"),
  };

  const gitHubVersion = await getGitHubVersionActionsOnly();
  checkGitHubVersionInRange(gitHubVersion, logger, Mode.actions);

  const repositoryNwo = parseRepositoryNwo(
    getRequiredEnvParam("GITHUB_REPOSITORY")
  );

  const featureFlags = new GitHubFeatureFlags(
    gitHubVersion,
    apiDetails,
    repositoryNwo,
    logger
  );

  try {
    const workflowErrors = await validateWorkflow();

    if (
      !(await sendStatusReport(
        await createStatusReportBase(
          "init",
          "starting",
          startedAt,
          workflowErrors
        )
      ))
    ) {
      return;
    }

    const initCodeQLResult = await initCodeQL(
      getOptionalInput("tools"),
      apiDetails,
      getTemporaryDirectory(),
      gitHubVersion.type,
      logger
    );
    codeql = initCodeQLResult.codeql;
    toolsVersion = initCodeQLResult.toolsVersion;
    await enrichEnvironment(Mode.actions, codeql);

    config = await initConfig(
      getOptionalInput("languages"),
      getOptionalInput("queries"),
      getOptionalInput("packs"),
      getOptionalInput("config-file"),
      getOptionalInput("db-location"),
      getOptionalInput("debug") === "true",
      getOptionalInput("debug-artifact-name") || DEFAULT_DEBUG_ARTIFACT_NAME,
      getOptionalInput("debug-database-name") || DEFAULT_DEBUG_DATABASE_NAME,
      repositoryNwo,
      getTemporaryDirectory(),
      codeql,
      getRequiredEnvParam("GITHUB_WORKSPACE"),
      gitHubVersion,
      apiDetails,
      featureFlags,
      logger
    );

    if (
      config.languages.includes(Language.python) &&
      getRequiredInput("setup-python-dependencies") === "true"
    ) {
      try {
        await installPythonDeps(codeql, logger);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warning(
          `${message} You can call this action with 'setup-python-dependencies: false' to disable this process`
        );
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    core.setFailed(message);
    console.log(e);
    await sendStatusReport(
      await createStatusReportBase("init", "aborted", startedAt, message)
    );
    return;
  }

  try {
    // Forward Go flags
    const goFlags = process.env["GOFLAGS"];
    if (goFlags) {
      core.exportVariable("GOFLAGS", goFlags);
      core.warning(
        "Passing the GOFLAGS env parameter to the init action is deprecated. Please move this to the analyze action."
      );
    }

    // Limit RAM and threads for extractors. When running extractors, the CodeQL CLI obeys the
    // CODEQL_RAM and CODEQL_THREADS environment variables to decide how much RAM and how many
    // threads it would ask extractors to use. See help text for the "--ram" and "--threads"
    // options at https://codeql.github.com/docs/codeql-cli/manual/database-trace-command/
    // for details.
    core.exportVariable(
      "CODEQL_RAM",
      process.env["CODEQL_RAM"] ||
        getMemoryFlagValue(getOptionalInput("ram")).toString()
    );
    core.exportVariable(
      "CODEQL_THREADS",
      getThreadsFlagValue(getOptionalInput("threads"), logger).toString()
    );

    const sourceRoot = path.resolve(
      getRequiredEnvParam("GITHUB_WORKSPACE"),
      getOptionalInput("source-root") || ""
    );

    const tracerConfig = await runInit(
      codeql,
      config,
      sourceRoot,
      "Runner.Worker.exe",
      undefined,
      featureFlags
    );
    if (tracerConfig !== undefined) {
      for (const [key, value] of Object.entries(tracerConfig.env)) {
        core.exportVariable(key, value);
      }

      if (
        process.platform === "win32" &&
        !(await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING))
      ) {
        await injectWindowsTracer(
          "Runner.Worker.exe",
          undefined,
          config,
          codeql,
          tracerConfig
        );
      }
    }

    core.setOutput("codeql-path", config.codeQLCmd);
  } catch (error) {
    core.setFailed(String(error));

    console.log(error);
    await sendStatusReport(
      await createStatusReportBase(
        "init",
        getActionsStatus(error),
        startedAt,
        String(error),
        error instanceof Error ? error.stack : undefined
      )
    );
    return;
  }
  await sendSuccessStatusReport(startedAt, config, toolsVersion);
}

async function runWrapper() {
  try {
    await run();
  } catch (error) {
    core.setFailed(`init action failed: ${error}`);
    console.log(error);
  }
}

void runWrapper();
