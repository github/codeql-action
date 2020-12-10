import * as fs from "fs";

import * as core from "@actions/core";

import * as actionsUtil from "./actions-util";
import { CodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import {
  initCodeQL,
  initConfig,
  injectWindowsTracer,
  installPythonDeps,
  runInit,
} from "./init";
import { Language } from "./languages";
import { getActionsLogger, Logger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { checkGitHubVersionInRange, getGitHubVersion } from "./util";

interface InitSuccessStatusReport extends actionsUtil.StatusReportBase {
  // Comma-separated list of languages that analysis was run for
  // This may be from the workflow file or may be calculated from repository contents
  languages: string;
  // Comma-separated list of languages specified explicitly in the workflow file
  workflow_languages: string;
  // Comma-separated list of paths, from the 'paths' config field
  paths: string;
  // Comma-separated list of paths, from the 'paths-ignore' config field
  paths_ignore: string;
  // Commas-separated list of languages where the default queries are disabled
  disable_default_queries: string;
  // Comma-separated list of queries sources, from the 'queries' config field or workflow input
  queries: string;
  // Value given by the user as the "tools" input
  tools_input: string;
  // Version of the bundle used
  tools_resolved_version: string;
}

async function sendSuccessStatusReport(
  startedAt: Date,
  config: configUtils.Config,
  toolsVersion: string
) {
  const statusReportBase = await actionsUtil.createStatusReportBase(
    "init",
    "success",
    startedAt
  );

  const languages = config.languages.join(",");
  const workflowLanguages = actionsUtil.getOptionalInput("languages");
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
  let queriesInput = actionsUtil.getOptionalInput("queries")?.trim();
  if (queriesInput === undefined || queriesInput.startsWith("+")) {
    queries.push(
      ...(config.originalUserInput.queries || []).map((q) => q.uses)
    );
  }
  if (queriesInput !== undefined) {
    queriesInput = queriesInput.startsWith("+")
      ? queriesInput.substr(1)
      : queriesInput;
    queries.push(...queriesInput.split(","));
  }

  const statusReport: InitSuccessStatusReport = {
    ...statusReportBase,
    languages,
    workflow_languages: workflowLanguages || "",
    paths,
    paths_ignore: pathsIgnore,
    disable_default_queries: disableDefaultQueries,
    queries: queries.join(","),
    tools_input: actionsUtil.getOptionalInput("tools") || "",
    tools_resolved_version: toolsVersion,
  };

  await actionsUtil.sendStatusReport(statusReport);
}

async function run() {
  const startedAt = new Date();
  const logger = getActionsLogger();
  let config: configUtils.Config;
  let codeql: CodeQL;
  let toolsVersion: string;

  const apiDetails = {
    auth: actionsUtil.getRequiredInput("token"),
    url: actionsUtil.getRequiredEnvParam("GITHUB_SERVER_URL"),
  };

  const gitHubVersion = await getGitHubVersion(apiDetails);
  if (gitHubVersion !== undefined) {
    checkGitHubVersionInRange(gitHubVersion, "actions", logger);
  }

  try {
    actionsUtil.prepareLocalRunEnvironment();

    const workflowErrors = await actionsUtil.getWorkflowErrors();

    // we do not want to worry users if linting is failing
    // but we do want to send a status report containing this error code
    // below
    const userWorkflowErrors = workflowErrors.filter(
      (o) => o.code !== "LintFailed"
    );

    if (userWorkflowErrors.length > 0) {
      core.warning(actionsUtil.formatWorkflowErrors(userWorkflowErrors));
    }

    if (
      !(await actionsUtil.sendStatusReport(
        await actionsUtil.createStatusReportBase(
          "init",
          "starting",
          startedAt,
          actionsUtil.formatWorkflowCause(workflowErrors)
        )
      ))
    ) {
      return;
    }

    const initCodeQLResult = await initCodeQL(
      actionsUtil.getOptionalInput("tools"),
      apiDetails,
      actionsUtil.getRequiredEnvParam("RUNNER_TEMP"),
      actionsUtil.getRequiredEnvParam("RUNNER_TOOL_CACHE"),
      "actions",
      logger
    );
    codeql = initCodeQLResult.codeql;
    toolsVersion = initCodeQLResult.toolsVersion;

    config = await initConfig(
      actionsUtil.getOptionalInput("languages"),
      actionsUtil.getOptionalInput("queries"),
      actionsUtil.getOptionalInput("config-file"),
      parseRepositoryNwo(actionsUtil.getRequiredEnvParam("GITHUB_REPOSITORY")),
      actionsUtil.getRequiredEnvParam("RUNNER_TEMP"),
      actionsUtil.getRequiredEnvParam("RUNNER_TOOL_CACHE"),
      codeql,
      actionsUtil.getRequiredEnvParam("GITHUB_WORKSPACE"),
      gitHubVersion,
      apiDetails,
      logger
    );

    // Compile queries and (TODO: extract query cache hash)
    // MG: Spell out what info we need from the config, and move to init.ts
    await compileQueries(codeql, config, logger);

    if (
      config.languages.includes(Language.python) &&
      actionsUtil.getRequiredInput("setup-python-dependencies") === "true"
    ) {
      try {
        await installPythonDeps(codeql, logger);
      } catch (err) {
        logger.warning(
          `${err.message} You can call this action with 'setup-python-dependencies: false' to disable this process`
        );
      }
    }
  } catch (e) {
    core.setFailed(e.message);
    console.log(e);
    await actionsUtil.sendStatusReport(
      await actionsUtil.createStatusReportBase(
        "init",
        "aborted",
        startedAt,
        e.message
      )
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

    // Setup CODEQL_RAM flag (todo improve this https://github.com/github/dsp-code-scanning/issues/935)
    const codeqlRam = process.env["CODEQL_RAM"] || "6500";
    core.exportVariable("CODEQL_RAM", codeqlRam);

    const tracerConfig = await runInit(codeql, config);
    if (tracerConfig !== undefined) {
      for (const [key, value] of Object.entries(tracerConfig.env)) {
        core.exportVariable(key, value);
      }

      if (process.platform === "win32") {
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
    core.setFailed(error.message);
    console.log(error);
    await actionsUtil.sendStatusReport(
      await actionsUtil.createStatusReportBase(
        "init",
        "failure",
        startedAt,
        error.message,
        error.stack
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

async function compileQueries(
  codeql: CodeQL,
  config: configUtils.Config,
  logger: Logger
): Promise<void> {
  // MG: This method is based of `runQueries`.
  //       Creating the query suite file could be refactored out of that method.
  for (const language of config.languages) {
    logger.startGroup(`Analyzing ${language}`);

    const queries = config.queries[language];
    if (queries.builtin.length === 0 && queries.custom.length === 0) {
      throw new Error(
        `Unable to analyse ${language} as no queries were selected for this language`
      );
    }

    for (const type of ["custom"]) {
      // MG: Only compile custom, but we would be ok doing also builtin
      if (queries[type].length > 0) {
        // Pass the queries to codeql using a file instead of using the command
        // line to avoid command line length restrictions, particularly on windows.
        const querySuitePath = `${language}-queries-${type}.qls`;
        const querySuiteContents = queries[type]
          .map((q: string) => `- query: ${q}`)
          .join("\n");
        fs.writeFileSync(querySuitePath, querySuiteContents);
        logger.debug(
          `Query suite file for ${language}...\n${querySuiteContents}`
        );

        await codeql.queryCompile(querySuitePath);

        logger.debug(`Queries compiled`);
        logger.endGroup();
      }
    }
  }
}

void runWrapper();
