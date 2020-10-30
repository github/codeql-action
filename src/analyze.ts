import * as fs from "fs";
import * as path from "path";

import * as toolrunnner from "@actions/exec/lib/toolrunner";

import * as analysisPaths from "./analysis-paths";
import { getCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { isScannedLanguage, Language } from "./languages";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import * as sharedEnv from "./shared-environment";
import * as upload_lib from "./upload-lib";
import * as util from "./util";

export class CodeQLAnalysisError extends Error {
  queriesStatusReport: QueriesStatusReport;

  constructor(queriesStatusReport: QueriesStatusReport, message: string) {
    super(message);

    this.name = "CodeQLAnalysisError";
    this.queriesStatusReport = queriesStatusReport;
  }
}

export interface QueriesStatusReport {
  // Time taken in ms to analyze builtin queries for cpp (or undefined if this language was not analyzed)
  analyze_builtin_queries_cpp_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for csharp (or undefined if this language was not analyzed)
  analyze_builtin_queries_csharp_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for go (or undefined if this language was not analyzed)
  analyze_builtin_queries_go_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for java (or undefined if this language was not analyzed)
  analyze_builtin_queries_java_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for javascript (or undefined if this language was not analyzed)
  analyze_builtin_queries_javascript_duration_ms?: number;
  // Time taken in ms to analyze builtin queries for python (or undefined if this language was not analyzed)
  analyze_builtin_queries_python_duration_ms?: number;
  // Time taken in ms to analyze custom queries for cpp (or undefined if this language was not analyzed)
  analyze_custom_queries_cpp_duration_ms?: number;
  // Time taken in ms to analyze custom queries for csharp (or undefined if this language was not analyzed)
  analyze_custom_queries_csharp_duration_ms?: number;
  // Time taken in ms to analyze custom queries for go (or undefined if this language was not analyzed)
  analyze_custom_queries_go_duration_ms?: number;
  // Time taken in ms to analyze custom queries for java (or undefined if this language was not analyzed)
  analyze_custom_queries_java_duration_ms?: number;
  // Time taken in ms to analyze custom queries for javascript (or undefined if this language was not analyzed)
  analyze_custom_queries_javascript_duration_ms?: number;
  // Time taken in ms to analyze custom queries for python (or undefined if this language was not analyzed)
  analyze_custom_queries_python_duration_ms?: number;
  // Name of language that errored during analysis (or undefined if no langauge failed)
  analyze_failure_language?: string;
}

export interface AnalysisStatusReport
  extends upload_lib.UploadStatusReport,
    QueriesStatusReport {}

async function setupPythonExtractor(logger: Logger) {
  const codeqlPython = process.env["CODEQL_PYTHON"];
  if (codeqlPython === undefined || codeqlPython.length === 0) {
    // If CODEQL_PYTHON is not set, no dependencies were installed, so we don't need to do anything
    return;
  }

  let output = "";
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  };

  await new toolrunnner.ToolRunner(
    codeqlPython,
    [
      "-c",
      "import os; import pip; print(os.path.dirname(os.path.dirname(pip.__file__)))",
    ],
    options
  ).exec();
  logger.info(`Setting LGTM_INDEX_IMPORT_PATH=${output}`);
  process.env["LGTM_INDEX_IMPORT_PATH"] = output;

  output = "";
  await new toolrunnner.ToolRunner(
    codeqlPython,
    ["-c", "import sys; print(sys.version_info[0])"],
    options
  ).exec();
  logger.info(`Setting LGTM_PYTHON_SETUP_VERSION=${output}`);
  process.env["LGTM_PYTHON_SETUP_VERSION"] = output;
}

async function createdDBForScannedLanguages(
  config: configUtils.Config,
  logger: Logger
) {
  // Insert the LGTM_INDEX_X env vars at this point so they are set when
  // we extract any scanned languages.
  analysisPaths.includeAndExcludeAnalysisPaths(config);

  const codeql = getCodeQL(config.codeQLCmd);
  for (const language of config.languages) {
    if (isScannedLanguage(language)) {
      logger.startGroup(`Extracting ${language}`);

      if (language === Language.python) {
        await setupPythonExtractor(logger);
      }

      await codeql.extractScannedLanguage(
        util.getCodeQLDatabasePath(config.tempDir, language),
        language
      );
      logger.endGroup();
    }
  }
}

async function finalizeDatabaseCreation(
  config: configUtils.Config,
  logger: Logger
) {
  await createdDBForScannedLanguages(config, logger);

  const codeql = getCodeQL(config.codeQLCmd);
  for (const language of config.languages) {
    logger.startGroup(`Finalizing ${language}`);
    await codeql.finalizeDatabase(
      util.getCodeQLDatabasePath(config.tempDir, language)
    );
    logger.endGroup();
  }
}

// Runs queries and creates sarif files in the given folder
export async function runQueries(
  sarifFolder: string,
  memoryFlag: string,
  addSnippetsFlag: string,
  threadsFlag: string,
  config: configUtils.Config,
  logger: Logger
): Promise<QueriesStatusReport> {
  const statusReport: QueriesStatusReport = {};

  for (const language of config.languages) {
    logger.startGroup(`Analyzing ${language}`);

    const queries = config.queries[language];
    if (queries.builtin.length === 0 && queries.custom.length === 0) {
      throw new Error(
        `Unable to analyse ${language} as no queries were selected for this language`
      );
    }

    try {
      for (const type of ["builtin", "custom"]) {
        if (queries[type].length > 0) {
          const startTime = new Date().getTime();

          const databasePath = util.getCodeQLDatabasePath(
            config.tempDir,
            language
          );
          // Pass the queries to codeql using a file instead of using the command
          // line to avoid command line length restrictions, particularly on windows.
          const querySuitePath = `${databasePath}-queries-${type}.qls`;
          const querySuiteContents = queries[type]
            .map((q: string) => `- query: ${q}`)
            .join("\n");
          fs.writeFileSync(querySuitePath, querySuiteContents);
          logger.debug(
            `Query suite file for ${language}...\n${querySuiteContents}`
          );

          const sarifFile = path.join(sarifFolder, `${language}-${type}.sarif`);

          const codeql = getCodeQL(config.codeQLCmd);
          await codeql.databaseAnalyze(
            databasePath,
            sarifFile,
            querySuitePath,
            memoryFlag,
            addSnippetsFlag,
            threadsFlag
          );

          logger.debug(
            `SARIF results for database ${language} created at "${sarifFile}"`
          );
          logger.endGroup();

          // Record the performance
          const endTime = new Date().getTime();
          statusReport[`analyze_${type}_queries_${language}_duration_ms`] =
            endTime - startTime;
        }
      }
    } catch (e) {
      logger.info(e);
      statusReport.analyze_failure_language = language;
      throw new CodeQLAnalysisError(
        statusReport,
        `Error running analysis for ${language}: ${e}`
      );
    }
  }

  return statusReport;
}

export async function runAnalyze(
  repositoryNwo: RepositoryNwo,
  commitOid: string,
  ref: string,
  analysisKey: string | undefined,
  analysisName: string | undefined,
  workflowRunID: number | undefined,
  checkoutPath: string,
  environment: string | undefined,
  githubAuth: string,
  githubUrl: string,
  doUpload: boolean,
  mode: util.Mode,
  outputDir: string,
  memoryFlag: string,
  addSnippetsFlag: string,
  threadsFlag: string,
  config: configUtils.Config,
  logger: Logger
): Promise<AnalysisStatusReport> {
  // Delete the tracer config env var to avoid tracing ourselves
  delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];

  fs.mkdirSync(outputDir, { recursive: true });

  logger.info("Finalizing database creation");
  await finalizeDatabaseCreation(config, logger);

  logger.info("Analyzing database");
  const queriesStats = await runQueries(
    outputDir,
    memoryFlag,
    addSnippetsFlag,
    threadsFlag,
    config,
    logger
  );

  if (!doUpload) {
    logger.info("Not uploading results");
    return { ...queriesStats };
  }

  const uploadStats = await upload_lib.upload(
    outputDir,
    repositoryNwo,
    commitOid,
    ref,
    analysisKey,
    analysisName,
    workflowRunID,
    checkoutPath,
    environment,
    githubAuth,
    githubUrl,
    mode,
    logger
  );

  return { ...queriesStats, ...uploadStats };
}
