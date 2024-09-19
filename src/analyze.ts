import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

import { safeWhich } from "@chrisgavin/safe-which";
import del from "del";
import * as yaml from "js-yaml";

import { setupCppAutobuild } from "./autobuild";
import {
  CODEQL_VERSION_ANALYSIS_SUMMARY_V2,
  CodeQL,
  getCodeQL,
} from "./codeql";
import * as configUtils from "./config-utils";
import { addDiagnostic, makeDiagnostic } from "./diagnostics";
import { EnvVar } from "./environment";
import { FeatureEnablement, Feature } from "./feature-flags";
import { isScannedLanguage, Language } from "./languages";
import { Logger } from "./logging";
import { DatabaseCreationTimings, EventReport } from "./status-report";
import { ToolsFeature } from "./tools-features";
import { endTracingForCluster } from "./tracer-config";
import { validateSarifFileSchema } from "./upload-lib";
import * as util from "./util";
import { BuildMode } from "./util";

export class CodeQLAnalysisError extends Error {
  constructor(
    public queriesStatusReport: QueriesStatusReport,
    public message: string,
    public error: Error,
  ) {
    super(message);
    this.name = "CodeQLAnalysisError";
  }
}

export interface QueriesStatusReport {
  /**
   * Time taken in ms to run queries for cpp (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_cpp_duration_ms?: number;
  /**
   * Time taken in ms to run queries for csharp (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_csharp_duration_ms?: number;
  /**
   * Time taken in ms to run queries for go (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_go_duration_ms?: number;
  /**
   * Time taken in ms to run queries for java (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_java_duration_ms?: number;
  /**
   * Time taken in ms to run queries for javascript (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_javascript_duration_ms?: number;
  /**
   * Time taken in ms to run queries for python (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_python_duration_ms?: number;
  /**
   * Time taken in ms to run queries for ruby (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_ruby_duration_ms?: number;
  /** Time taken in ms to run queries for swift (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_swift_duration_ms?: number;

  /** Time taken in ms to interpret results for cpp (or undefined if this language was not analyzed). */
  interpret_results_cpp_duration_ms?: number;
  /** Time taken in ms to interpret results for csharp (or undefined if this language was not analyzed). */
  interpret_results_csharp_duration_ms?: number;
  /** Time taken in ms to interpret results for go (or undefined if this language was not analyzed). */
  interpret_results_go_duration_ms?: number;
  /** Time taken in ms to interpret results for java (or undefined if this language was not analyzed). */
  interpret_results_java_duration_ms?: number;
  /** Time taken in ms to interpret results for javascript (or undefined if this language was not analyzed). */
  interpret_results_javascript_duration_ms?: number;
  /** Time taken in ms to interpret results for python (or undefined if this language was not analyzed). */
  interpret_results_python_duration_ms?: number;
  /** Time taken in ms to interpret results for ruby (or undefined if this language was not analyzed). */
  interpret_results_ruby_duration_ms?: number;
  /** Time taken in ms to interpret results for swift (or undefined if this language was not analyzed). */
  interpret_results_swift_duration_ms?: number;

  /** Name of language that errored during analysis (or undefined if no language failed). */
  analyze_failure_language?: string;
  /** Reports on discrete events associated with this status report. */
  event_reports?: EventReport[];
}

async function setupPythonExtractor(logger: Logger) {
  const codeqlPython = process.env["CODEQL_PYTHON"];
  if (codeqlPython === undefined || codeqlPython.length === 0) {
    // If CODEQL_PYTHON is not set, no dependencies were installed, so we don't need to do anything
    return;
  }

  logger.warning(
    "The CODEQL_PYTHON environment variable is no longer supported. Please remove it from your workflow. This environment variable was originally used to specify a Python executable that included the dependencies of your Python code, however Python analysis no longer uses these dependencies." +
      "\nIf you used CODEQL_PYTHON to force the version of Python to analyze as, please use CODEQL_EXTRACTOR_PYTHON_ANALYSIS_VERSION instead, such as 'CODEQL_EXTRACTOR_PYTHON_ANALYSIS_VERSION=2.7' or 'CODEQL_EXTRACTOR_PYTHON_ANALYSIS_VERSION=3.11'.",
  );
  return;
}

export async function runExtraction(
  codeql: CodeQL,
  config: configUtils.Config,
  logger: Logger,
) {
  for (const language of config.languages) {
    if (dbIsFinalized(config, language, logger)) {
      logger.debug(
        `Database for ${language} has already been finalized, skipping extraction.`,
      );
      continue;
    }

    if (shouldExtractLanguage(config, language)) {
      logger.startGroup(`Extracting ${language}`);
      if (language === Language.python) {
        await setupPythonExtractor(logger);
      }
      if (
        config.buildMode &&
        (await codeql.supportsFeature(ToolsFeature.TraceCommandUseBuildMode))
      ) {
        if (
          language === Language.cpp &&
          config.buildMode === BuildMode.Autobuild
        ) {
          await setupCppAutobuild(codeql, logger);
        }
        await codeql.extractUsingBuildMode(config, language);
      } else {
        await codeql.extractScannedLanguage(config, language);
      }
      logger.endGroup();
    }
  }
}

function shouldExtractLanguage(
  config: configUtils.Config,
  language: Language,
): boolean {
  return (
    config.buildMode === BuildMode.None ||
    (config.buildMode === BuildMode.Autobuild &&
      process.env[EnvVar.AUTOBUILD_DID_COMPLETE_SUCCESSFULLY] !== "true") ||
    (!config.buildMode && isScannedLanguage(language))
  );
}

export function dbIsFinalized(
  config: configUtils.Config,
  language: Language,
  logger: Logger,
) {
  const dbPath = util.getCodeQLDatabasePath(config, language);
  try {
    const dbInfo = yaml.load(
      fs.readFileSync(path.resolve(dbPath, "codeql-database.yml"), "utf8"),
    ) as { inProgress?: boolean };
    return !("inProgress" in dbInfo);
  } catch {
    logger.warning(
      `Could not check whether database for ${language} was finalized. Assuming it is not.`,
    );
    return false;
  }
}

async function finalizeDatabaseCreation(
  codeql: CodeQL,
  config: configUtils.Config,
  threadsFlag: string,
  memoryFlag: string,
  logger: Logger,
): Promise<DatabaseCreationTimings> {
  const extractionStart = performance.now();
  await runExtraction(codeql, config, logger);
  const extractionTime = performance.now() - extractionStart;

  const trapImportStart = performance.now();
  for (const language of config.languages) {
    if (dbIsFinalized(config, language, logger)) {
      logger.info(
        `There is already a finalized database for ${language} at the location where the CodeQL Action places databases, so we did not create one.`,
      );
    } else {
      logger.startGroup(`Finalizing ${language}`);
      await codeql.finalizeDatabase(
        util.getCodeQLDatabasePath(config, language),
        threadsFlag,
        memoryFlag,
        config.debugMode,
      );
      logger.endGroup();
    }
  }
  const trapImportTime = performance.now() - trapImportStart;

  return {
    scanned_language_extraction_duration_ms: Math.round(extractionTime),
    trap_import_duration_ms: Math.round(trapImportTime),
  };
}

// Runs queries and creates sarif files in the given folder
export async function runQueries(
  sarifFolder: string,
  memoryFlag: string,
  addSnippetsFlag: string,
  threadsFlag: string,
  automationDetailsId: string | undefined,
  config: configUtils.Config,
  logger: Logger,
  features: FeatureEnablement,
): Promise<QueriesStatusReport> {
  const statusReport: QueriesStatusReport = {};

  const codeql = await getCodeQL(config.codeQLCmd);
  const queryFlags = [memoryFlag, threadsFlag];

  for (const language of config.languages) {
    try {
      const sarifFile = path.join(sarifFolder, `${language}.sarif`);

      // The work needed to generate the query suites
      // is done in the CLI. We just need to make a single
      // call to run all the queries for each language and
      // another to interpret the results.
      logger.startGroup(`Running queries for ${language}`);
      const startTimeRunQueries = new Date().getTime();
      const databasePath = util.getCodeQLDatabasePath(config, language);
      await codeql.databaseRunQueries(databasePath, queryFlags);
      logger.debug(`Finished running queries for ${language}.`);
      // TODO should not be using `builtin` here. We should be using `all` instead.
      // The status report does not support `all` yet.
      statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
        new Date().getTime() - startTimeRunQueries;

      logger.startGroup(`Interpreting results for ${language}`);
      const startTimeInterpretResults = new Date();
      const analysisSummary = await runInterpretResults(
        language,
        undefined,
        sarifFile,
        config.debugMode,
      );
      const endTimeInterpretResults = new Date();
      statusReport[`interpret_results_${language}_duration_ms`] =
        endTimeInterpretResults.getTime() - startTimeInterpretResults.getTime();
      logger.endGroup();
      logger.info(analysisSummary);

      if (await features.getValue(Feature.QaTelemetryEnabled)) {
        const perQueryAlertCounts = getPerQueryAlertCounts(sarifFile, logger);

        const perQueryAlertCountEventReport: EventReport = {
          event: "codeql database interpret-results",
          started_at: startTimeInterpretResults.toISOString(),
          completed_at: endTimeInterpretResults.toISOString(),
          exit_status: "success",
          language,
          properties: {
            alertCounts: perQueryAlertCounts,
          },
        };

        if (statusReport["event_reports"] === undefined) {
          statusReport["event_reports"] = [];
        }
        statusReport["event_reports"].push(perQueryAlertCountEventReport);
      }

      if (
        !(await util.codeQlVersionAtLeast(
          codeql,
          CODEQL_VERSION_ANALYSIS_SUMMARY_V2,
        ))
      ) {
        await runPrintLinesOfCode(language);
      }
    } catch (e) {
      statusReport.analyze_failure_language = language;
      throw new CodeQLAnalysisError(
        statusReport,
        `Error running analysis for ${language}: ${util.getErrorMessage(e)}`,
        util.wrapError(e),
      );
    }
  }

  return statusReport;

  async function runInterpretResults(
    language: Language,
    queries: string[] | undefined,
    sarifFile: string,
    enableDebugLogging: boolean,
  ): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    return await codeql.databaseInterpretResults(
      databasePath,
      queries,
      sarifFile,
      addSnippetsFlag,
      threadsFlag,
      enableDebugLogging ? "-vv" : "-v",
      automationDetailsId,
      config,
      features,
    );
  }

  /** Get an object with all queries and their counts parsed from a SARIF file path. */
  function getPerQueryAlertCounts(
    sarifPath: string,
    log: Logger,
  ): Record<string, number> {
    validateSarifFileSchema(sarifPath, log);
    const sarifObject = JSON.parse(
      fs.readFileSync(sarifPath, "utf8"),
    ) as util.SarifFile;
    // We do not need to compute fingerprints because we are not sending data based off of locations.

    // Generate the query: alert count object
    const perQueryAlertCounts: Record<string, number> = {};

    // All rules (queries), from all results, from all runs
    for (const sarifRun of sarifObject.runs) {
      if (sarifRun.results) {
        for (const result of sarifRun.results) {
          const query = result.rule?.id || result.ruleId;
          if (query) {
            perQueryAlertCounts[query] = (perQueryAlertCounts[query] || 0) + 1;
          }
        }
      }
    }
    return perQueryAlertCounts;
  }

  async function runPrintLinesOfCode(language: Language): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    return await codeql.databasePrintBaseline(databasePath);
  }
}

export async function runFinalize(
  outputDir: string,
  threadsFlag: string,
  memoryFlag: string,
  codeql: CodeQL,
  config: configUtils.Config,
  logger: Logger,
): Promise<DatabaseCreationTimings> {
  try {
    await del(outputDir, { force: true });
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  await fs.promises.mkdir(outputDir, { recursive: true });

  const timings = await finalizeDatabaseCreation(
    codeql,
    config,
    threadsFlag,
    memoryFlag,
    logger,
  );

  // If we didn't already end tracing in the autobuild Action, end it now.
  if (process.env[EnvVar.AUTOBUILD_DID_COMPLETE_SUCCESSFULLY] !== "true") {
    await endTracingForCluster(codeql, config, logger);
  }
  return timings;
}

export async function warnIfGoInstalledAfterInit(
  config: configUtils.Config,
  logger: Logger,
) {
  // Check that `which go` still points at the same path it did when the `init` Action ran to ensure that no steps
  // in-between performed any setup. We encourage users to perform all setup tasks before initializing CodeQL so that
  // the setup tasks do not interfere with our analysis.
  // Furthermore, if we installed a wrapper script in the `init` Action, we need to ensure that there isn't a step
  // in the workflow after the `init` step which installs a different version of Go and takes precedence in the PATH,
  // thus potentially circumventing our workaround that allows tracing to work.
  const goInitPath = process.env[EnvVar.GO_BINARY_LOCATION];

  if (
    process.env[EnvVar.DID_AUTOBUILD_GOLANG] !== "true" &&
    goInitPath !== undefined
  ) {
    const goBinaryPath = await safeWhich("go");

    if (goInitPath !== goBinaryPath) {
      logger.warning(
        `Expected \`which go\` to return ${goInitPath}, but got ${goBinaryPath}: please ensure that the correct version of Go is installed before the \`codeql-action/init\` Action is used.`,
      );

      addDiagnostic(
        config,
        Language.go,
        makeDiagnostic(
          "go/workflow/go-installed-after-codeql-init",
          "Go was installed after the `codeql-action/init` Action was run",
          {
            markdownMessage:
              "To avoid interfering with the CodeQL analysis, perform all installation steps before calling the `github/codeql-action/init` Action.",
            visibility: {
              statusPage: true,
              telemetry: true,
              cliSummaryTable: true,
            },
            severity: "warning",
          },
        ),
      );
    }
  }
}

export async function runCleanup(
  config: configUtils.Config,
  cleanupLevel: string,
  logger: Logger,
): Promise<void> {
  logger.startGroup("Cleaning up databases");
  for (const language of config.languages) {
    const codeql = await getCodeQL(config.codeQLCmd);
    const databasePath = util.getCodeQLDatabasePath(config, language);
    await codeql.databaseCleanup(databasePath, cleanupLevel);
  }
  logger.endGroup();
}
