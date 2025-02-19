import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

import * as io from "@actions/io";
import del from "del";
import * as yaml from "js-yaml";

import * as actionsUtil from "./actions-util";
import { getApiClient } from "./api-client";
import { setupCppAutobuild } from "./autobuild";
import { CodeQL, getCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { addDiagnostic, makeDiagnostic } from "./diagnostics";
import {
  DiffThunkRange,
  writeDiffRangesJsonFile,
} from "./diff-filtering-utils";
import { EnvVar } from "./environment";
import { FeatureEnablement, Feature } from "./feature-flags";
import { isScannedLanguage, Language } from "./languages";
import { Logger, withGroupAsync } from "./logging";
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

  /**
   * Whether the analysis is diff-informed (in the sense that the action generates a diff-range data
   * extension for the analysis, regardless of whether the data extension is actually used by queries).
   */
  analysis_is_diff_informed?: boolean;

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

/**
 * Set up the diff-informed analysis feature.
 *
 * @param baseRef The base branch name, used for calculating the diff range.
 * @param headLabel The label that uniquely identifies the head branch across
 * repositories, used for calculating the diff range.
 * @param codeql
 * @param logger
 * @param features
 * @returns Absolute path to the directory containing the extension pack for
 * the diff range information, or `undefined` if the feature is disabled.
 */
export async function setupDiffInformedQueryRun(
  baseRef: string,
  headLabel: string,
  codeql: CodeQL,
  logger: Logger,
  features: FeatureEnablement,
): Promise<string | undefined> {
  if (!(await features.getValue(Feature.DiffInformedQueries, codeql))) {
    return undefined;
  }
  return await withGroupAsync(
    "Generating diff range extension pack",
    async () => {
      const diffRanges = await getPullRequestEditedDiffRanges(
        baseRef,
        headLabel,
        logger,
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
 * Return the file line ranges that were added or modified in the pull request.
 *
 * @param baseRef The base branch name, used for calculating the diff range.
 * @param headLabel The label that uniquely identifies the head branch across
 * repositories, used for calculating the diff range.
 * @param logger
 * @returns An array of tuples, where each tuple contains the absolute path of a
 * file, the start line and the end line (both 1-based and inclusive) of an
 * added or modified range in that file. Returns `undefined` if the action was
 * not triggered by a pull request or if there was an error.
 */
async function getPullRequestEditedDiffRanges(
  baseRef: string,
  headLabel: string,
  logger: Logger,
): Promise<DiffThunkRange[] | undefined> {
  const fileDiffs = await getFileDiffsWithBasehead(baseRef, headLabel, logger);
  if (fileDiffs === undefined) {
    return undefined;
  }
  if (fileDiffs.length >= 300) {
    // The "compare two commits" API returns a maximum of 300 changed files. If
    // we see that many changed files, it is possible that there could be more,
    // with the rest being truncated. In this case, we should not attempt to
    // compute the diff ranges, as the result would be incomplete.
    logger.warning(
      `Cannot retrieve the full diff because there are too many ` +
        `(${fileDiffs.length}) changed files in the pull request.`,
    );
    return undefined;
  }
  const results: DiffThunkRange[] = [];
  for (const filediff of fileDiffs) {
    const diffRanges = getDiffRanges(filediff, logger);
    if (diffRanges === undefined) {
      return undefined;
    }
    results.push(...diffRanges);
  }
  return results;
}

/**
 * This interface is an abbreviated version of the file diff object returned by
 * the GitHub API.
 */
interface FileDiff {
  filename: string;
  changes: number;
  // A patch may be absent if the file is binary, if the file diff is too large,
  // or if the file is unchanged.
  patch?: string | undefined;
}

async function getFileDiffsWithBasehead(
  baseRef: string,
  headLabel: string,
  logger: Logger,
): Promise<FileDiff[] | undefined> {
  const ownerRepo = util.getRequiredEnvParam("GITHUB_REPOSITORY").split("/");
  const owner = ownerRepo[0];
  const repo = ownerRepo[1];
  const basehead = `${baseRef}...${headLabel}`;
  try {
    const response = await getApiClient().rest.repos.compareCommitsWithBasehead(
      {
        owner,
        repo,
        basehead,
        per_page: 1,
      },
    );
    logger.debug(
      `Response from compareCommitsWithBasehead(${basehead}):` +
        `\n${JSON.stringify(response, null, 2)}`,
    );
    return response.data.files;
  } catch (error: any) {
    if (error.status) {
      logger.warning(`Error retrieving diff ${basehead}: ${error.message}`);
      logger.debug(
        `Error running compareCommitsWithBasehead(${basehead}):` +
          `\nRequest: ${JSON.stringify(error.request, null, 2)}` +
          `\nError Response: ${JSON.stringify(error.response, null, 2)}`,
      );
      return undefined;
    } else {
      throw error;
    }
  }
}

function getDiffRanges(
  fileDiff: FileDiff,
  logger: Logger,
): DiffThunkRange[] | undefined {
  // Diff-informed queries expect the file path to be absolute. CodeQL always
  // uses forward slashes as the path separator, so on Windows we need to
  // replace any backslashes with forward slashes.
  const filename = path
    .join(actionsUtil.getRequiredInput("checkout_path"), fileDiff.filename)
    .replaceAll(path.sep, "/");

  if (fileDiff.patch === undefined) {
    if (fileDiff.changes === 0) {
      // There are situations where a changed file legitimately has no diff.
      // For example, the file may be a binary file, or that the file may have
      // been renamed with no changes to its contents. In these cases, the
      // file would be reported as having 0 changes, and we can return an empty
      // array to indicate no diff range in this file.
      return [];
    }
    // If a file is reported to have nonzero changes but no patch, that may be
    // due to the file diff being too large. In this case, we should fall back
    // to a special diff range that covers the entire file.
    return [
      {
        path: filename,
        startLine: 0,
        endLine: 0,
      },
    ];
  }

  // The 1-based file line number of the current line
  let currentLine = 0;
  // The 1-based file line number that starts the current range of added lines
  let additionRangeStartLine: number | undefined = undefined;
  const diffRanges: DiffThunkRange[] = [];

  const diffLines = fileDiff.patch.split("\n");
  // Adding a fake context line at the end ensures that the following loop will
  // always terminate the last range of added lines.
  diffLines.push(" ");

  for (const diffLine of diffLines) {
    if (diffLine.startsWith("-")) {
      // Ignore deletions completely -- we do not even want to consider them when
      // calculating consecutive ranges of added lines.
      continue;
    }
    if (diffLine.startsWith("+")) {
      if (additionRangeStartLine === undefined) {
        additionRangeStartLine = currentLine;
      }
      currentLine++;
      continue;
    }
    if (additionRangeStartLine !== undefined) {
      // Any line that does not start with a "+" or "-" terminates the current
      // range of added lines.
      diffRanges.push({
        path: filename,
        startLine: additionRangeStartLine,
        endLine: currentLine - 1,
      });
      additionRangeStartLine = undefined;
    }
    if (diffLine.startsWith("@@ ")) {
      // A new hunk header line resets the current line number.
      const match = diffLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match === null) {
        logger.warning(
          `Cannot parse diff hunk header for ${fileDiff.filename}: ${diffLine}`,
        );
        return undefined;
      }
      currentLine = parseInt(match[1], 10);
      continue;
    }
    if (diffLine.startsWith(" ")) {
      // An unchanged context line advances the current line number.
      currentLine++;
      continue;
    }
  }
  return diffRanges;
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

  const diffRangeDir = path.join(
    actionsUtil.getTemporaryDirectory(),
    "pr-diff-range",
  );
  fs.mkdirSync(diffRangeDir);
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
    data:
`;

  let data = ranges
    .map(
      (range) =>
        // Using yaml.dump() with `forceQuotes: true` ensures that all special
        // characters are escaped, and that the path is always rendered as a
        // quoted string on a single line.
        `      - [${yaml.dump(range.path, { forceQuotes: true }).trim()}, ` +
        `${range.startLine}, ${range.endLine}]\n`,
    )
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

  // Write the diff ranges to a JSON file, for action-side alert filtering by the
  // upload-lib module.
  writeDiffRangesJsonFile(logger, ranges);

  return diffRangeDir;
}

// Runs queries and creates sarif files in the given folder
export async function runQueries(
  sarifFolder: string,
  memoryFlag: string,
  addSnippetsFlag: string,
  threadsFlag: string,
  diffRangePackDir: string | undefined,
  automationDetailsId: string | undefined,
  config: configUtils.Config,
  logger: Logger,
  features: FeatureEnablement,
): Promise<QueriesStatusReport> {
  const statusReport: QueriesStatusReport = {};

  statusReport.analysis_is_diff_informed = diffRangePackDir !== undefined;
  const dataExtensionFlags = diffRangePackDir
    ? [
        `--additional-packs=${diffRangePackDir}`,
        "--extension-packs=codeql-action/pr-diff-range",
      ]
    : [];
  const sarifRunPropertyFlag = diffRangePackDir
    ? "--sarif-run-property=incrementalMode=diff-informed"
    : undefined;

  const codeql = await getCodeQL(config.codeQLCmd);
  const queryFlags = [memoryFlag, threadsFlag, ...dataExtensionFlags];

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
      sarifRunPropertyFlag,
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
    const goBinaryPath = await io.which("go", true);

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

export const exportedForTesting = {
  getDiffRanges,
};
