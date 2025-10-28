import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

import * as io from "@actions/io";
import * as del from "del";
import * as yaml from "js-yaml";

import { getTemporaryDirectory, getRequiredInput } from "./actions-util";
import * as analyses from "./analyses";
import { setupCppAutobuild } from "./autobuild";
import { type CodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { getJavaTempDependencyDir } from "./dependency-caching";
import { addDiagnostic, makeDiagnostic } from "./diagnostics";
import {
  DiffThunkRange,
  readDiffRangesJsonFile,
} from "./diff-informed-analysis-utils";
import { EnvVar } from "./environment";
import { FeatureEnablement, Feature } from "./feature-flags";
import { KnownLanguage, Language } from "./languages";
import { Logger, withGroupAsync } from "./logging";
import { OverlayDatabaseMode } from "./overlay-database-utils";
import { DatabaseCreationTimings, EventReport } from "./status-report";
import { endTracingForCluster } from "./tracer-config";
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
   * Time taken in ms to run queries for actions (or undefined if this language was not analyzed).
   *
   * The "builtin" designation is now outdated with the move to CLI config parsing: this is the time
   * taken to run _all_ the queries.
   */
  analyze_builtin_queries_actions_duration_ms?: number;
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

  /** Time taken in ms to interpret results for actions (or undefined if this language was not analyzed). */
  interpret_results_actions_duration_ms?: number;
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

  /**
   * Whether the analysis is diff-informed (in the sense that the action generates a diff-range data
   * extension for the analysis, regardless of whether the data extension is actually used by queries).
   */
  analysis_is_diff_informed?: boolean;

  /**
   * Whether the analysis runs in overlay mode (i.e., uses an overlay-base database).
   * This is true if the AugmentationProperties.overlayDatabaseMode === Overlay.
   */
  analysis_is_overlay?: boolean;

  /**
   * Whether the analysis builds an overlay-base database.
   * This is true if the AugmentationProperties.overlayDatabaseMode === OverlayBase.
   */
  analysis_builds_overlay_base_database?: boolean;

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

    if (await shouldExtractLanguage(codeql, config, language)) {
      logger.startGroup(`Extracting ${language}`);
      if (language === KnownLanguage.python) {
        await setupPythonExtractor(logger);
      }
      if (config.buildMode) {
        if (
          language === KnownLanguage.cpp &&
          config.buildMode === BuildMode.Autobuild
        ) {
          await setupCppAutobuild(codeql, logger);
        }

        // The Java `build-mode: none` extractor places dependencies (.jar files) in the
        // database scratch directory by default. For dependency caching purposes, we want
        // a stable path that caches can be restored into and that we can cache at the
        // end of the workflow (i.e. that does not get removed when the scratch directory is).
        if (
          language === KnownLanguage.java &&
          config.buildMode === BuildMode.None
        ) {
          process.env["CODEQL_EXTRACTOR_JAVA_OPTION_BUILDLESS_DEPENDENCY_DIR"] =
            getJavaTempDependencyDir();
        }

        await codeql.extractUsingBuildMode(config, language);
      } else {
        await codeql.extractScannedLanguage(config, language);
      }
      logger.endGroup();
    }
  }
}

async function shouldExtractLanguage(
  codeql: CodeQL,
  config: configUtils.Config,
  language: Language,
): Promise<boolean> {
  return (
    config.buildMode === BuildMode.None ||
    (config.buildMode === BuildMode.Autobuild &&
      process.env[EnvVar.AUTOBUILD_DID_COMPLETE_SUCCESSFULLY] !== "true") ||
    (!config.buildMode && (await codeql.isScannedLanguage(language)))
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

/**
 * Set up the diff-informed analysis feature.
 *
 * @returns Absolute path to the directory containing the extension pack for
 * the diff range information, or `undefined` if the feature is disabled.
 */
export async function setupDiffInformedQueryRun(
  logger: Logger,
): Promise<string | undefined> {
  return await withGroupAsync(
    "Generating diff range extension pack",
    async () => {
      // Only use precomputed diff ranges; never recompute here.
      let diffRanges: DiffThunkRange[] | undefined;
      try {
        diffRanges = readDiffRangesJsonFile(logger);
      } catch (e) {
        logger.debug(
          `Failed to read precomputed diff ranges: ${util.getErrorMessage(e)}`,
        );
        diffRanges = undefined;
      }

      if (diffRanges === undefined) {
        logger.info(
          "No precomputed diff ranges found; skipping diff-informed analysis stage.",
        );
        return undefined;
      }

      const fileCount = new Set(
        diffRanges.filter((r) => r.path).map((r) => r.path),
      ).size;
      logger.info(
        `Using precomputed diff ranges (${diffRanges.length} ranges across ${fileCount} files).`,
      );

      const packDir = writeDiffRangeDataExtensionPack(logger, diffRanges);
      if (packDir === undefined) {
        logger.warning(
          "Cannot create diff range extension pack for diff-informed queries; " +
            "reverting to performing full analysis.",
        );
      } else {
        logger.info(
          `Successfully created diff range extension pack at ${packDir}.`,
        );
      }
      return packDir;
    },
  );
}

/**
 * Create an extension pack in the temporary directory that contains the file
 * line ranges that were added or modified in the pull request.
 *
 * @param logger
 * @param ranges The file line ranges, as returned by
 * `getPullRequestEditedDiffRanges`.
 * @returns The absolute path of the directory containing the extension pack, or
 * `undefined` if no extension pack was created.
 */
function writeDiffRangeDataExtensionPack(
  logger: Logger,
  ranges: DiffThunkRange[] | undefined,
): string | undefined {
  if (ranges === undefined) {
    return undefined;
  }

  if (ranges.length === 0) {
    // An empty diff range means that there are no added or modified lines in
    // the pull request. But the `restrictAlertsTo` extensible predicate
    // interprets an empty data extension differently, as an indication that
    // all alerts should be included. So we need to specifically set the diff
    // range to a non-empty list that cannot match any alert location.
    ranges = [{ path: "", startLine: 0, endLine: 0 }];
  }

  const diffRangeDir = path.join(getTemporaryDirectory(), "pr-diff-range");

  // We expect the Actions temporary directory to already exist, so are mainly
  // using `recursive: true` to avoid errors if the directory already exists,
  // for example if the analyze Action is run multiple times in the same job.
  // This is not really something that is supported, but we make use of it in
  // tests.
  fs.mkdirSync(diffRangeDir, { recursive: true });
  fs.writeFileSync(
    path.join(diffRangeDir, "qlpack.yml"),
    `
name: codeql-action/pr-diff-range
version: 0.0.0
library: true
extensionTargets:
  codeql/util: '*'
dataExtensions:
  - pr-diff-range.yml
`,
  );

  const header = `
extensions:
  - addsTo:
      pack: codeql/util
      extensible: restrictAlertsTo
      checkPresence: false
    data:
`;

  let data = ranges
    .map((range) => {
      // Diff-informed queries expect the file path to be absolute. CodeQL always
      // uses forward slashes as the path separator, so on Windows we need to
      // replace any backslashes with forward slashes.
      const filename = path
        .join(getRequiredInput("checkout_path"), range.path)
        .replaceAll(path.sep, "/");

      // Using yaml.dump() with `forceQuotes: true` ensures that all special
      // characters are escaped, and that the path is always rendered as a
      // quoted string on a single line.
      return (
        `      - [${yaml.dump(filename, { forceQuotes: true }).trim()}, ` +
        `${range.startLine}, ${range.endLine}]\n`
      );
    })
    .join("");
  if (!data) {
    // Ensure that the data extension is not empty, so that a pull request with
    // no edited lines would exclude (instead of accepting) all alerts.
    data = '      - ["", 0, 0]\n';
  }

  const extensionContents = header + data;
  const extensionFilePath = path.join(diffRangeDir, "pr-diff-range.yml");
  fs.writeFileSync(extensionFilePath, extensionContents);
  logger.debug(
    `Wrote pr-diff-range extension pack to ${extensionFilePath}:\n${extensionContents}`,
  );

  return diffRangeDir;
}

// A set of default query suite names that are understood by the CLI.
export const defaultSuites: Set<string> = new Set([
  "security-experimental",
  "security-extended",
  "security-and-quality",
  "code-quality",
  "code-scanning",
]);

/**
 * If `maybeSuite` is the name of a default query suite, it is resolved into the corresponding
 * query suite name for the given `language`. Otherwise, `maybeSuite` is returned as is.
 *
 * @param language The language for which to resolve the default query suite name.
 * @param maybeSuite The string that potentially contains the name of a default query suite.
 * @returns Returns the resolved query suite name, or the unmodified input.
 */
export function resolveQuerySuiteAlias(
  language: Language,
  maybeSuite: string,
): string {
  if (defaultSuites.has(maybeSuite)) {
    return `${language}-${maybeSuite}.qls`;
  }

  return maybeSuite;
}

/**
 * Adds the appropriate file extension for the given analysis configuration to the given base filename.
 */
export function addSarifExtension(
  analysis: analyses.AnalysisConfig,
  base: string,
): string {
  return `${base}${analysis.sarifExtension}`;
}

// Runs queries and creates sarif files in the given folder
export async function runQueries(
  sarifFolder: string,
  memoryFlag: string,
  addSnippetsFlag: string,
  threadsFlag: string,
  diffRangePackDir: string | undefined,
  automationDetailsId: string | undefined,
  codeql: CodeQL,
  config: configUtils.Config,
  logger: Logger,
  features: FeatureEnablement,
): Promise<QueriesStatusReport> {
  const statusReport: QueriesStatusReport = {};
  const queryFlags = [memoryFlag, threadsFlag];
  const incrementalMode: string[] = [];

  // Preserve cached intermediate results for overlay-base databases.
  if (config.overlayDatabaseMode !== OverlayDatabaseMode.OverlayBase) {
    queryFlags.push("--expect-discarded-cache");
  }

  statusReport.analysis_is_diff_informed = diffRangePackDir !== undefined;
  if (diffRangePackDir) {
    queryFlags.push(`--additional-packs=${diffRangePackDir}`);
    queryFlags.push("--extension-packs=codeql-action/pr-diff-range");
    incrementalMode.push("diff-informed");
  }

  statusReport.analysis_is_overlay =
    config.overlayDatabaseMode === OverlayDatabaseMode.Overlay;
  statusReport.analysis_builds_overlay_base_database =
    config.overlayDatabaseMode === OverlayDatabaseMode.OverlayBase;
  if (config.overlayDatabaseMode === OverlayDatabaseMode.Overlay) {
    incrementalMode.push("overlay");
  }

  const sarifRunPropertyFlag =
    incrementalMode.length > 0
      ? `--sarif-run-property=incrementalMode=${incrementalMode.join(",")}`
      : undefined;

  const dbAnalysisConfig = configUtils.getPrimaryAnalysisConfig(config);

  for (const language of config.languages) {
    try {
      // This should be empty to run only the query suite that was generated when
      // the database was initialised.
      const queries: string[] = [];

      // If multiple analysis kinds are enabled, the database is initialised for Code Scanning.
      // To avoid duplicate work, we want to run queries for all analyses at the same time.
      // To do this, we invoke `run-queries` once with the generated query suite that was created
      // when the database was initialised + the queries for other analysis kinds.
      if (config.analysisKinds.length > 1) {
        queries.push(util.getGeneratedSuitePath(config, language));

        if (configUtils.isCodeQualityEnabled(config)) {
          for (const qualityQuery of analyses.codeQualityQueries) {
            queries.push(resolveQuerySuiteAlias(language, qualityQuery));
          }
        }
      }

      // The work needed to generate the query suites
      // is done in the CLI. We just need to make a single
      // call to run all the queries for each language and
      // another to interpret the results.
      logger.startGroup(`Running queries for ${language}`);
      const startTimeRunQueries = new Date().getTime();
      const databasePath = util.getCodeQLDatabasePath(config, language);
      await codeql.databaseRunQueries(databasePath, queryFlags, queries);
      logger.debug(`Finished running queries for ${language}.`);
      // TODO should not be using `builtin` here. We should be using `all` instead.
      // The status report does not support `all` yet.
      statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
        new Date().getTime() - startTimeRunQueries;

      // There is always at least one analysis kind enabled. Running `interpret-results`
      // produces the SARIF file for the analysis kind that the database was initialised with.
      const startTimeInterpretResults = new Date();
      const { summary: analysisSummary, sarifFile } =
        await runInterpretResultsFor(
          dbAnalysisConfig,
          language,
          undefined,
          config.debugMode,
        );

      // This case is only needed if Code Quality is not the sole analysis kind.
      // In this case, we will have run queries for all analysis kinds. The previous call to
      // `interpret-results` will have produced a SARIF file for Code Scanning and we now
      // need to produce an additional SARIF file for Code Quality.
      let qualityAnalysisSummary: string | undefined;
      if (
        config.analysisKinds.length > 1 &&
        configUtils.isCodeQualityEnabled(config)
      ) {
        const qualityResult = await runInterpretResultsFor(
          analyses.CodeQuality,
          language,
          analyses.codeQualityQueries.map((i) =>
            resolveQuerySuiteAlias(language, i),
          ),
          config.debugMode,
        );
        qualityAnalysisSummary = qualityResult.summary;
      }
      const endTimeInterpretResults = new Date();
      statusReport[`interpret_results_${language}_duration_ms`] =
        endTimeInterpretResults.getTime() - startTimeInterpretResults.getTime();
      logger.endGroup();

      logger.info(analysisSummary);
      if (qualityAnalysisSummary) {
        logger.info(qualityAnalysisSummary);
      }

      if (await features.getValue(Feature.QaTelemetryEnabled)) {
        // Note: QA adds the `code-quality` query suite to the `queries` input,
        // so this is fine since there is no `.quality.sarif`.
        const perQueryAlertCounts = getPerQueryAlertCounts(sarifFile);

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

  async function runInterpretResultsFor(
    analysis: analyses.AnalysisConfig,
    language: Language,
    queries: string[] | undefined,
    enableDebugLogging: boolean,
  ): Promise<{ summary: string; sarifFile: string }> {
    logger.info(`Interpreting ${analysis.name} results for ${language}`);

    // If this is a Code Quality analysis, correct the category to one
    // accepted by the Code Quality backend.
    let category = automationDetailsId;
    if (analysis.kind === analyses.AnalysisKind.CodeQuality) {
      category = analysis.fixCategory(logger, automationDetailsId);
    }

    const sarifFile = path.join(
      sarifFolder,
      addSarifExtension(analysis, language),
    );

    const summary = await runInterpretResults(
      language,
      queries,
      sarifFile,
      enableDebugLogging,
      category,
    );

    return { summary, sarifFile };
  }

  async function runInterpretResults(
    language: Language,
    queries: string[] | undefined,
    sarifFile: string,
    enableDebugLogging: boolean,
    category: string | undefined,
  ): Promise<string> {
    const databasePath = util.getCodeQLDatabasePath(config, language);
    return await codeql.databaseInterpretResults(
      databasePath,
      queries,
      sarifFile,
      addSnippetsFlag,
      threadsFlag,
      enableDebugLogging ? "-vv" : "-v",
      sarifRunPropertyFlag,
      category,
      config,
      features,
    );
  }

  /** Get an object with all queries and their counts parsed from a SARIF file path. */
  function getPerQueryAlertCounts(sarifPath: string): Record<string, number> {
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
    await del.deleteAsync(outputDir, { force: true });
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
    const goBinaryPath = await io.which("go", true);

    if (goInitPath !== goBinaryPath) {
      logger.warning(
        `Expected \`which go\` to return ${goInitPath}, but got ${goBinaryPath}: please ensure that the correct version of Go is installed before the \`codeql-action/init\` Action is used.`,
      );

      addDiagnostic(
        config,
        KnownLanguage.go,
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
