import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks"; // We need to import `performance` on Node 12

import * as toolrunner from "@actions/exec/lib/toolrunner";
import del from "del";
import * as yaml from "js-yaml";

import { DatabaseCreationTimings } from "./actions-util";
import * as analysisPaths from "./analysis-paths";
import { CodeQL, CODEQL_VERSION_NEW_TRACING, getCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { FeatureEnablement } from "./feature-flags";
import { isScannedLanguage, Language } from "./languages";
import { Logger } from "./logging";
import * as sharedEnv from "./shared-environment";
import { endTracingForCluster } from "./tracer-config";
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
  /** Time taken in ms to run builtin queries for cpp (or undefined if this language was not analyzed). */
  analyze_builtin_queries_cpp_duration_ms?: number;
  /** Time taken in ms to run builtin queries for csharp (or undefined if this language was not analyzed). */
  analyze_builtin_queries_csharp_duration_ms?: number;
  /** Time taken in ms to run builtin queries for go (or undefined if this language was not analyzed). */
  analyze_builtin_queries_go_duration_ms?: number;
  /** Time taken in ms to run builtin queries for java (or undefined if this language was not analyzed). */
  analyze_builtin_queries_java_duration_ms?: number;
  /** Time taken in ms to run builtin queries for javascript (or undefined if this language was not analyzed). */
  analyze_builtin_queries_javascript_duration_ms?: number;
  /** Time taken in ms to run builtin queries for python (or undefined if this language was not analyzed). */
  analyze_builtin_queries_python_duration_ms?: number;
  /** Time taken in ms to run builtin queries for ruby (or undefined if this language was not analyzed). */
  analyze_builtin_queries_ruby_duration_ms?: number;
  /** Time taken in ms to run builtin queries for swift (or undefined if this language was not analyzed). */
  analyze_builtin_queries_swift_duration_ms?: number;
  /** Time taken in ms to run custom queries for cpp (or undefined if this language was not analyzed). */
  analyze_custom_queries_cpp_duration_ms?: number;
  /** Time taken in ms to run custom queries for csharp (or undefined if this language was not analyzed). */
  analyze_custom_queries_csharp_duration_ms?: number;
  /** Time taken in ms to run custom queries for go (or undefined if this language was not analyzed). */
  analyze_custom_queries_go_duration_ms?: number;
  /** Time taken in ms to run custom queries for java (or undefined if this language was not analyzed). */
  analyze_custom_queries_java_duration_ms?: number;
  /** Time taken in ms to run custom queries for javascript (or undefined if this language was not analyzed). */
  analyze_custom_queries_javascript_duration_ms?: number;
  /** Time taken in ms to run custom queries for python (or undefined if this language was not analyzed). */
  analyze_custom_queries_python_duration_ms?: number;
  /** Time taken in ms to run custom queries for ruby (or undefined if this language was not analyzed). */
  analyze_custom_queries_ruby_duration_ms?: number;
  /** Time taken in ms to run custom queries for swift (or undefined if this language was not analyzed). */
  analyze_custom_queries_swift_duration_ms?: number;
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
}

async function setupPythonExtractor(logger: Logger) {
  const codeqlPython = process.env["CODEQL_PYTHON"];
  if (codeqlPython === undefined || codeqlPython.length === 0) {
    // If CODEQL_PYTHON is not set, no dependencies were installed, so we don't need to do anything
    return;
  }

  const scriptsFolder = path.resolve(__dirname, "../python-setup");

  let output = "";
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  };

  await new toolrunner.ToolRunner(
    codeqlPython,
    [path.join(scriptsFolder, "find_site_packages.py")],
    options
  ).exec();
  logger.info(`Setting LGTM_INDEX_IMPORT_PATH=${output}`);
  process.env["LGTM_INDEX_IMPORT_PATH"] = output;

  output = "";
  await new toolrunner.ToolRunner(
    codeqlPython,
    ["-c", "import sys; print(sys.version_info[0])"],
    options
  ).exec();
  logger.info(`Setting LGTM_PYTHON_SETUP_VERSION=${output}`);
  process.env["LGTM_PYTHON_SETUP_VERSION"] = output;
}

export async function createdDBForScannedLanguages(
  codeql: CodeQL,
  config: configUtils.Config,
  logger: Logger
) {
  // Insert the LGTM_INDEX_X env vars at this point so they are set when
  // we extract any scanned languages.
  analysisPaths.includeAndExcludeAnalysisPaths(config);

  for (const language of config.languages) {
    if (
      isScannedLanguage(language) &&
      !dbIsFinalized(config, language, logger)
    ) {
      logger.startGroup(`Extracting ${language}`);

      if (language === Language.python) {
        await setupPythonExtractor(logger);
      }

      await codeql.extractScannedLanguage(config, language);
      logger.endGroup();
    }
  }
}

export function dbIsFinalized(
  config: configUtils.Config,
  language: Language,
  logger: Logger
) {
  const dbPath = util.getCodeQLDatabasePath(config, language);
  try {
    const dbInfo = yaml.load(
      fs.readFileSync(path.resolve(dbPath, "codeql-database.yml"), "utf8")
    ) as { inProgress?: boolean };
    return !("inProgress" in dbInfo);
  } catch (e) {
    logger.warning(
      `Could not check whether database for ${language} was finalized. Assuming it is not.`
    );
    return false;
  }
}

async function finalizeDatabaseCreation(
  config: configUtils.Config,
  threadsFlag: string,
  memoryFlag: string,
  logger: Logger
): Promise<DatabaseCreationTimings> {
  const codeql = await getCodeQL(config.codeQLCmd);

  const extractionStart = performance.now();
  await createdDBForScannedLanguages(codeql, config, logger);
  const extractionTime = performance.now() - extractionStart;

  const trapImportStart = performance.now();
  for (const language of config.languages) {
    if (dbIsFinalized(config, language, logger)) {
      logger.info(
        `There is already a finalized database for ${language} at the location where the CodeQL Action places databases, so we did not create one.`
      );
    } else {
      logger.startGroup(`Finalizing ${language}`);
      await codeql.finalizeDatabase(
        util.getCodeQLDatabasePath(config, language),
        threadsFlag,
        memoryFlag
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
  featureEnablement: FeatureEnablement
): Promise<QueriesStatusReport> {
  const statusReport: QueriesStatusReport = {};

  const codeql = await getCodeQL(config.codeQLCmd);

  await util.logCodeScanningConfigInCli(codeql, featureEnablement, logger);

  for (const language of config.languages) {
    const queries = config.queries[language];
    const queryFilters = validateQueryFilters(
      config.originalUserInput["query-filters"]
    );
    const packsWithVersion = config.packs[language] || [];

    try {
      if (await util.useCodeScanningConfigInCli(codeql, featureEnablement)) {
        // If we are using the code scanning config in the CLI,
        // much of the work needed to generate the query suites
        // is done in the CLI. We just need to make a single
        // call to run all the queries for each language and
        // another to interpret the results.
        logger.startGroup(`Running queries for ${language}`);
        const startTimeBuiltIn = new Date().getTime();
        await runQueryGroup(language, "all", undefined, undefined);
        // TODO should not be using `builtin` here. We should be using `all` instead.
        // The status report does not support `all` yet.
        statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
          new Date().getTime() - startTimeBuiltIn;

        logger.startGroup(`Interpreting results for ${language}`);
        const startTimeInterpretResults = new Date().getTime();
        const sarifFile = path.join(sarifFolder, `${language}.sarif`);
        const analysisSummary = await runInterpretResults(
          language,
          undefined,
          sarifFile,
          config.debugMode
        );
        statusReport[`interpret_results_${language}_duration_ms`] =
          new Date().getTime() - startTimeInterpretResults;
        logger.endGroup();
        logger.info(analysisSummary);
      } else {
        // config was generated by the action, so must be interpreted by the action.

        const hasBuiltinQueries = queries?.builtin.length > 0;
        const hasCustomQueries = queries?.custom.length > 0;
        const hasPackWithCustomQueries = packsWithVersion.length > 0;

        if (
          !hasBuiltinQueries &&
          !hasCustomQueries &&
          !hasPackWithCustomQueries
        ) {
          throw new Error(
            `Unable to analyze ${language} as no queries were selected for this language`
          );
        }

        logger.startGroup(`Running queries for ${language}`);
        const querySuitePaths: string[] = [];
        if (queries["builtin"].length > 0) {
          const startTimeBuiltIn = new Date().getTime();
          querySuitePaths.push(
            (await runQueryGroup(
              language,
              "builtin",
              createQuerySuiteContents(queries["builtin"], queryFilters),
              undefined
            )) as string
          );
          statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
            new Date().getTime() - startTimeBuiltIn;
        }
        const startTimeCustom = new Date().getTime();
        let ranCustom = false;
        for (let i = 0; i < queries["custom"].length; ++i) {
          if (queries["custom"][i].queries.length > 0) {
            querySuitePaths.push(
              (await runQueryGroup(
                language,
                `custom-${i}`,
                createQuerySuiteContents(
                  queries["custom"][i].queries,
                  queryFilters
                ),
                queries["custom"][i].searchPath
              )) as string
            );
            ranCustom = true;
          }
        }
        if (packsWithVersion.length > 0) {
          querySuitePaths.push(
            await runQueryPacks(
              language,
              "packs",
              packsWithVersion,
              queryFilters
            )
          );
          ranCustom = true;
        }
        if (ranCustom) {
          statusReport[`analyze_custom_queries_${language}_duration_ms`] =
            new Date().getTime() - startTimeCustom;
        }
        logger.endGroup();
        logger.startGroup(`Interpreting results for ${language}`);
        const startTimeInterpretResults = new Date().getTime();
        const sarifFile = path.join(sarifFolder, `${language}.sarif`);
        const analysisSummary = await runInterpretResults(
          language,
          querySuitePaths,
          sarifFile,
          config.debugMode
        );
        statusReport[`interpret_results_${language}_duration_ms`] =
          new Date().getTime() - startTimeInterpretResults;
        logger.endGroup();
        logger.info(analysisSummary);
      }
      logger.info(await runPrintLinesOfCode(language));
    } catch (e) {
      logger.info(String(e));
      if (e instanceof Error) {
        logger.info(e.stack!);
      }
      statusReport.analyze_failure_language = language;
      throw new CodeQLAnalysisError(
        statusReport,
        `Error running analysis for ${language}: ${e}`
      );
    }
  }

  return statusReport;

  async function runInterpretResults(
    language: Language,
    queries: string[] | undefined,
    sarifFile: string,
    enableDebugLogging: boolean
  ): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    return await codeql.databaseInterpretResults(
      databasePath,
      queries,
      sarifFile,
      addSnippetsFlag,
      threadsFlag,
      enableDebugLogging ? "-vv" : "-v",
      automationDetailsId
    );
  }

  async function runPrintLinesOfCode(language: Language): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    return await codeql.databasePrintBaseline(databasePath);
  }

  async function runQueryGroup(
    language: Language,
    type: string,
    querySuiteContents: string | undefined,
    searchPath: string | undefined
  ): Promise<string | undefined> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    // Pass the queries to codeql using a file instead of using the command
    // line to avoid command line length restrictions, particularly on windows.
    const querySuitePath = querySuiteContents
      ? `${databasePath}-queries-${type}.qls`
      : undefined;
    if (querySuiteContents && querySuitePath) {
      fs.writeFileSync(querySuitePath, querySuiteContents);
      logger.debug(
        `Query suite file for ${language}-${type}...\n${querySuiteContents}`
      );
    }
    await codeql.databaseRunQueries(
      databasePath,
      searchPath,
      querySuitePath,
      memoryFlag,
      threadsFlag
    );

    logger.debug(`BQRS results produced for ${language} (queries: ${type})"`);
    return querySuitePath;
  }
  async function runQueryPacks(
    language: Language,
    type: string,
    packs: string[],
    queryFilters: configUtils.QueryFilter[]
  ): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);

    for (const pack of packs) {
      logger.debug(`Running query pack for ${language}-${type}: ${pack}`);
    }

    // combine the list of packs into a query suite in order to run them all simultaneously.
    const querySuite = (
      packs.map(convertPackToQuerySuiteEntry) as configUtils.QuerySuiteEntry[]
    ).concat(queryFilters);

    const querySuitePath = `${databasePath}-queries-${type}.qls`;
    fs.writeFileSync(querySuitePath, yaml.dump(querySuite));

    logger.debug(`BQRS results produced for ${language} (queries: ${type})"`);

    await codeql.databaseRunQueries(
      databasePath,
      undefined,
      querySuitePath,
      memoryFlag,
      threadsFlag
    );

    return querySuitePath;
  }
}

export function convertPackToQuerySuiteEntry(
  packStr: string
): configUtils.QuerySuitePackEntry {
  const pack = configUtils.parsePacksSpecification(packStr);
  return {
    qlpack: !pack.path ? pack.name : undefined,
    from: pack.path ? pack.name : undefined,
    version: pack.version,
    query: pack.path?.endsWith(".ql") ? pack.path : undefined,
    queries:
      !pack.path?.endsWith(".ql") && !pack.path?.endsWith(".qls")
        ? pack.path
        : undefined,
    apply: pack.path?.endsWith(".qls") ? pack.path : undefined,
  };
}

export function createQuerySuiteContents(
  queries: string[],
  queryFilters: configUtils.QueryFilter[]
) {
  return yaml.dump(
    queries.map((q: string) => ({ query: q })).concat(queryFilters as any)
  );
}

export async function runFinalize(
  outputDir: string,
  threadsFlag: string,
  memoryFlag: string,
  config: configUtils.Config,
  logger: Logger
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
    config,
    threadsFlag,
    memoryFlag,
    logger
  );

  const codeql = await getCodeQL(config.codeQLCmd);
  // WARNING: This does not _really_ end tracing, as the tracer will restore its
  // critical environment variables and it'll still be active for all processes
  // launched from this build step.
  // However, it will stop tracing for all steps past the codeql-action/analyze
  // step.
  if (await util.codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING)) {
    // Delete variables as specified by the end-tracing script
    await endTracingForCluster(config);
  } else {
    // Delete the tracer config env var to avoid tracing ourselves
    delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];
  }
  return timings;
}

export async function runCleanup(
  config: configUtils.Config,
  cleanupLevel: string,
  logger: Logger
): Promise<void> {
  logger.startGroup("Cleaning up databases");
  for (const language of config.languages) {
    const codeql = await getCodeQL(config.codeQLCmd);
    const databasePath = util.getCodeQLDatabasePath(config, language);
    await codeql.databaseCleanup(databasePath, cleanupLevel);
  }
  logger.endGroup();
}

// exported for testing
export function validateQueryFilters(queryFilters?: configUtils.QueryFilter[]) {
  if (!queryFilters) {
    return [];
  }

  if (!Array.isArray(queryFilters)) {
    throw new Error(
      `Query filters must be an array of "include" or "exclude" entries. Found ${typeof queryFilters}`
    );
  }

  const errors: string[] = [];
  for (const qf of queryFilters) {
    const keys = Object.keys(qf);
    if (keys.length !== 1) {
      errors.push(
        `Query filter must have exactly one key: ${JSON.stringify(qf)}`
      );
    }
    if (!["exclude", "include"].includes(keys[0])) {
      errors.push(
        `Only "include" or "exclude" filters are allowed:\n${JSON.stringify(
          qf
        )}`
      );
    }
  }

  if (errors.length) {
    throw new Error(`Invalid query filter.\n${errors.join("\n")}`);
  }

  return queryFilters;
}
