import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import del from "del";
import * as yaml from "js-yaml";

import * as analysisPaths from "./analysis-paths";
import {
  CODEQL_VERSION_COUNTS_LINES,
  CODEQL_VERSION_NEW_TRACING,
  getCodeQL,
} from "./codeql";
import * as configUtils from "./config-utils";
import { countLoc } from "./count-loc";
import { FeatureFlags } from "./feature-flags";
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
  /** Name of language that errored during analysis (or undefined if no language failed). */
  analyze_failure_language?: string;
}

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

  await new toolrunner.ToolRunner(
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
  await new toolrunner.ToolRunner(
    codeqlPython,
    ["-c", "import sys; print(sys.version_info[0])"],
    options
  ).exec();
  logger.info(`Setting LGTM_PYTHON_SETUP_VERSION=${output}`);
  process.env["LGTM_PYTHON_SETUP_VERSION"] = output;
}

async function createdDBForScannedLanguages(
  config: configUtils.Config,
  logger: Logger,
  featureFlags: FeatureFlags
) {
  // Insert the LGTM_INDEX_X env vars at this point so they are set when
  // we extract any scanned languages.
  analysisPaths.includeAndExcludeAnalysisPaths(config);

  const codeql = await getCodeQL(config.codeQLCmd);
  for (const language of config.languages) {
    if (
      isScannedLanguage(language) &&
      !dbIsFinalized(config, language, logger)
    ) {
      logger.startGroup(`Extracting ${language}`);

      if (language === Language.python) {
        await setupPythonExtractor(logger);
      }

      await codeql.extractScannedLanguage(
        util.getCodeQLDatabasePath(config, language),
        language,
        featureFlags
      );
      logger.endGroup();
    }
  }
}

function dbIsFinalized(
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
  logger: Logger,
  featureFlags: FeatureFlags
) {
  await createdDBForScannedLanguages(config, logger, featureFlags);

  const codeql = await getCodeQL(config.codeQLCmd);
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
}

// Runs queries and creates sarif files in the given folder
export async function runQueries(
  sarifFolder: string,
  memoryFlag: string,
  addSnippetsFlag: string,
  threadsFlag: string,
  automationDetailsId: string | undefined,
  config: configUtils.Config,
  logger: Logger
): Promise<QueriesStatusReport> {
  const statusReport: QueriesStatusReport = {};

  let locPromise: Promise<Partial<Record<Language, number>>> = Promise.resolve(
    {}
  );
  const cliCanCountBaseline = await cliCanCountLoC();
  const debugMode =
    process.env["INTERNAL_CODEQL_ACTION_DEBUG_LOC"] ||
    process.env["ACTIONS_RUNNER_DEBUG"] ||
    process.env["ACTIONS_STEP_DEBUG"];
  if (!cliCanCountBaseline || debugMode) {
    // count the number of lines in the background
    locPromise = countLoc(
      path.resolve(),
      // config.paths specifies external directories. the current
      // directory is included in the analysis by default. Replicate
      // that here.
      config.paths,
      config.pathsIgnore,
      config.languages,
      logger
    );
  }

  for (const language of config.languages) {
    const queries = config.queries[language];
    const packsWithVersion = config.packs[language] || [];

    const hasBuiltinQueries = queries?.builtin.length > 0;
    const hasCustomQueries = queries?.custom.length > 0;
    const hasPackWithCustomQueries = packsWithVersion.length > 0;

    if (!hasBuiltinQueries && !hasCustomQueries && !hasPackWithCustomQueries) {
      throw new Error(
        `Unable to analyse ${language} as no queries were selected for this language`
      );
    }

    const codeql = await getCodeQL(config.codeQLCmd);
    try {
      if (hasPackWithCustomQueries) {
        logger.info("Performing analysis with custom CodeQL Packs.");
        logger.startGroup(`Downloading custom packs for ${language}`);

        const results = await codeql.packDownload(packsWithVersion);

        logger.info(
          `Downloaded packs: ${results.packs
            .map((r) => `${r.name}@${r.version || "latest"}`)
            .join(", ")}`
        );

        logger.endGroup();
      }

      logger.startGroup(`Running queries for ${language}`);
      const querySuitePaths: string[] = [];
      if (queries["builtin"].length > 0) {
        const startTimeBuiltIn = new Date().getTime();
        querySuitePaths.push(
          await runQueryGroup(
            language,
            "builtin",
            createQuerySuiteContents(queries["builtin"]),
            undefined
          )
        );
        statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
          new Date().getTime() - startTimeBuiltIn;
      }
      const startTimeCustom = new Date().getTime();
      let ranCustom = false;
      for (let i = 0; i < queries["custom"].length; ++i) {
        if (queries["custom"][i].queries.length > 0) {
          querySuitePaths.push(
            await runQueryGroup(
              language,
              `custom-${i}`,
              createQuerySuiteContents(queries["custom"][i].queries),
              queries["custom"][i].searchPath
            )
          );
          ranCustom = true;
        }
      }
      if (packsWithVersion.length > 0) {
        querySuitePaths.push(
          ...(await runQueryPacks(
            language,
            "packs",
            packsWithVersion,
            undefined
          ))
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
        sarifFile
      );
      if (!cliCanCountBaseline)
        await injectLinesOfCode(sarifFile, language, locPromise);
      statusReport[`interpret_results_${language}_duration_ms`] =
        new Date().getTime() - startTimeInterpretResults;
      logger.endGroup();
      logger.info(analysisSummary);
      if (!cliCanCountBaseline || debugMode)
        printLinesOfCodeSummary(logger, language, await locPromise);
      if (cliCanCountBaseline) logger.info(await runPrintLinesOfCode(language));
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
    queries: string[],
    sarifFile: string
  ): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    const codeql = await getCodeQL(config.codeQLCmd);
    return await codeql.databaseInterpretResults(
      databasePath,
      queries,
      sarifFile,
      addSnippetsFlag,
      threadsFlag,
      automationDetailsId
    );
  }

  async function cliCanCountLoC() {
    return await util.codeQlVersionAbove(
      await getCodeQL(config.codeQLCmd),
      CODEQL_VERSION_COUNTS_LINES
    );
  }

  async function runPrintLinesOfCode(language: Language): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    const codeql = await getCodeQL(config.codeQLCmd);
    return await codeql.databasePrintBaseline(databasePath);
  }

  async function runQueryGroup(
    language: Language,
    type: string,
    querySuiteContents: string,
    searchPath: string | undefined
  ): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    // Pass the queries to codeql using a file instead of using the command
    // line to avoid command line length restrictions, particularly on windows.
    const querySuitePath = `${databasePath}-queries-${type}.qls`;
    fs.writeFileSync(querySuitePath, querySuiteContents);
    logger.debug(
      `Query suite file for ${language}-${type}...\n${querySuiteContents}`
    );

    const codeql = await getCodeQL(config.codeQLCmd);
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
    searchPath: string | undefined
  ): Promise<string[]> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    // Run the queries individually instead of all at once to avoid command
    // line length restrictions, particularly on windows.

    for (const pack of packs) {
      logger.debug(`Running query pack for ${language}-${type}: ${pack}`);

      const codeql = await getCodeQL(config.codeQLCmd);
      await codeql.databaseRunQueries(
        databasePath,
        searchPath,
        pack,
        memoryFlag,
        threadsFlag
      );

      logger.debug(`BQRS results produced for ${language} (queries: ${type})"`);
    }
    return packs;
  }
}

function createQuerySuiteContents(queries: string[]) {
  return queries.map((q: string) => `- query: ${q}`).join("\n");
}

export async function runFinalize(
  outputDir: string,
  threadsFlag: string,
  memoryFlag: string,
  config: configUtils.Config,
  logger: Logger,
  featureFlags: FeatureFlags
) {
  const codeql = await getCodeQL(config.codeQLCmd);
  if (await util.codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING)) {
    // Delete variables as specified by the end-tracing script
    await endTracingForCluster(config);
  } else {
    // Delete the tracer config env var to avoid tracing ourselves
    delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];
  }

  try {
    await del(outputDir, { force: true });
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
  await fs.promises.mkdir(outputDir, { recursive: true });

  await finalizeDatabaseCreation(
    config,
    threadsFlag,
    memoryFlag,
    logger,
    featureFlags
  );
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

async function injectLinesOfCode(
  sarifFile: string,
  language: Language,
  locPromise: Promise<Partial<Record<Language, number>>>
) {
  const lineCounts = await locPromise;
  if (language in lineCounts) {
    const sarif = JSON.parse(fs.readFileSync(sarifFile, "utf8"));

    if (Array.isArray(sarif.runs)) {
      for (const run of sarif.runs) {
        run.properties = run.properties || {};
        run.properties.metricResults = run.properties.metricResults || [];
        for (const metric of run.properties.metricResults) {
          // Baseline is inserted when matching rule has tag lines-of-code
          if (metric.rule && metric.rule.toolComponent) {
            const matchingRule =
              run.tool.extensions[metric.rule.toolComponent.index].rules[
                metric.rule.index
              ];
            if (matchingRule.properties.tags?.includes("lines-of-code")) {
              metric.baseline = lineCounts[language];
            }
          }
        }
      }
    }

    fs.writeFileSync(sarifFile, JSON.stringify(sarif));
  }
}

function printLinesOfCodeSummary(
  logger: Logger,
  language: Language,
  lineCounts: Partial<Record<Language, number>>
) {
  if (language in lineCounts) {
    logger.info(
      `Counted a baseline of ${lineCounts[language]} lines of code for ${language}.`
    );
  }
}
