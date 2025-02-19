"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportedForTesting = exports.CodeQLAnalysisError = void 0;
exports.runExtraction = runExtraction;
exports.dbIsFinalized = dbIsFinalized;
exports.setupDiffInformedQueryRun = setupDiffInformedQueryRun;
exports.runQueries = runQueries;
exports.runFinalize = runFinalize;
exports.warnIfGoInstalledAfterInit = warnIfGoInstalledAfterInit;
exports.runCleanup = runCleanup;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const perf_hooks_1 = require("perf_hooks");
const io = __importStar(require("@actions/io"));
const del_1 = __importDefault(require("del"));
const yaml = __importStar(require("js-yaml"));
const actionsUtil = __importStar(require("./actions-util"));
const api_client_1 = require("./api-client");
const autobuild_1 = require("./autobuild");
const codeql_1 = require("./codeql");
const diagnostics_1 = require("./diagnostics");
const diff_filtering_utils_1 = require("./diff-filtering-utils");
const environment_1 = require("./environment");
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const tools_features_1 = require("./tools-features");
const tracer_config_1 = require("./tracer-config");
const upload_lib_1 = require("./upload-lib");
const util = __importStar(require("./util"));
const util_1 = require("./util");
class CodeQLAnalysisError extends Error {
    constructor(queriesStatusReport, message, error) {
        super(message);
        this.queriesStatusReport = queriesStatusReport;
        this.message = message;
        this.error = error;
        this.name = "CodeQLAnalysisError";
    }
}
exports.CodeQLAnalysisError = CodeQLAnalysisError;
async function setupPythonExtractor(logger) {
    const codeqlPython = process.env["CODEQL_PYTHON"];
    if (codeqlPython === undefined || codeqlPython.length === 0) {
        // If CODEQL_PYTHON is not set, no dependencies were installed, so we don't need to do anything
        return;
    }
    logger.warning("The CODEQL_PYTHON environment variable is no longer supported. Please remove it from your workflow. This environment variable was originally used to specify a Python executable that included the dependencies of your Python code, however Python analysis no longer uses these dependencies." +
        "\nIf you used CODEQL_PYTHON to force the version of Python to analyze as, please use CODEQL_EXTRACTOR_PYTHON_ANALYSIS_VERSION instead, such as 'CODEQL_EXTRACTOR_PYTHON_ANALYSIS_VERSION=2.7' or 'CODEQL_EXTRACTOR_PYTHON_ANALYSIS_VERSION=3.11'.");
    return;
}
async function runExtraction(codeql, config, logger) {
    for (const language of config.languages) {
        if (dbIsFinalized(config, language, logger)) {
            logger.debug(`Database for ${language} has already been finalized, skipping extraction.`);
            continue;
        }
        if (shouldExtractLanguage(config, language)) {
            logger.startGroup(`Extracting ${language}`);
            if (language === languages_1.Language.python) {
                await setupPythonExtractor(logger);
            }
            if (config.buildMode &&
                (await codeql.supportsFeature(tools_features_1.ToolsFeature.TraceCommandUseBuildMode))) {
                if (language === languages_1.Language.cpp &&
                    config.buildMode === util_1.BuildMode.Autobuild) {
                    await (0, autobuild_1.setupCppAutobuild)(codeql, logger);
                }
                await codeql.extractUsingBuildMode(config, language);
            }
            else {
                await codeql.extractScannedLanguage(config, language);
            }
            logger.endGroup();
        }
    }
}
function shouldExtractLanguage(config, language) {
    return (config.buildMode === util_1.BuildMode.None ||
        (config.buildMode === util_1.BuildMode.Autobuild &&
            process.env[environment_1.EnvVar.AUTOBUILD_DID_COMPLETE_SUCCESSFULLY] !== "true") ||
        (!config.buildMode && (0, languages_1.isScannedLanguage)(language)));
}
function dbIsFinalized(config, language, logger) {
    const dbPath = util.getCodeQLDatabasePath(config, language);
    try {
        const dbInfo = yaml.load(fs.readFileSync(path.resolve(dbPath, "codeql-database.yml"), "utf8"));
        return !("inProgress" in dbInfo);
    }
    catch {
        logger.warning(`Could not check whether database for ${language} was finalized. Assuming it is not.`);
        return false;
    }
}
async function finalizeDatabaseCreation(codeql, config, threadsFlag, memoryFlag, logger) {
    const extractionStart = perf_hooks_1.performance.now();
    await runExtraction(codeql, config, logger);
    const extractionTime = perf_hooks_1.performance.now() - extractionStart;
    const trapImportStart = perf_hooks_1.performance.now();
    for (const language of config.languages) {
        if (dbIsFinalized(config, language, logger)) {
            logger.info(`There is already a finalized database for ${language} at the location where the CodeQL Action places databases, so we did not create one.`);
        }
        else {
            logger.startGroup(`Finalizing ${language}`);
            await codeql.finalizeDatabase(util.getCodeQLDatabasePath(config, language), threadsFlag, memoryFlag, config.debugMode);
            logger.endGroup();
        }
    }
    const trapImportTime = perf_hooks_1.performance.now() - trapImportStart;
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
async function setupDiffInformedQueryRun(baseRef, headLabel, codeql, logger, features) {
    if (!(await features.getValue(feature_flags_1.Feature.DiffInformedQueries, codeql))) {
        return undefined;
    }
    return await (0, logging_1.withGroupAsync)("Generating diff range extension pack", async () => {
        const diffRanges = await getPullRequestEditedDiffRanges(baseRef, headLabel, logger);
        const packDir = writeDiffRangeDataExtensionPack(logger, diffRanges);
        if (packDir === undefined) {
            logger.warning("Cannot create diff range extension pack for diff-informed queries; " +
                "reverting to performing full analysis.");
        }
        else {
            logger.info(`Successfully created diff range extension pack at ${packDir}.`);
        }
        return packDir;
    });
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
async function getPullRequestEditedDiffRanges(baseRef, headLabel, logger) {
    const fileDiffs = await getFileDiffsWithBasehead(baseRef, headLabel, logger);
    if (fileDiffs === undefined) {
        return undefined;
    }
    if (fileDiffs.length >= 300) {
        // The "compare two commits" API returns a maximum of 300 changed files. If
        // we see that many changed files, it is possible that there could be more,
        // with the rest being truncated. In this case, we should not attempt to
        // compute the diff ranges, as the result would be incomplete.
        logger.warning(`Cannot retrieve the full diff because there are too many ` +
            `(${fileDiffs.length}) changed files in the pull request.`);
        return undefined;
    }
    const results = [];
    for (const filediff of fileDiffs) {
        const diffRanges = getDiffRanges(filediff, logger);
        if (diffRanges === undefined) {
            return undefined;
        }
        results.push(...diffRanges);
    }
    return results;
}
async function getFileDiffsWithBasehead(baseRef, headLabel, logger) {
    const ownerRepo = util.getRequiredEnvParam("GITHUB_REPOSITORY").split("/");
    const owner = ownerRepo[0];
    const repo = ownerRepo[1];
    const basehead = `${baseRef}...${headLabel}`;
    try {
        const response = await (0, api_client_1.getApiClient)().rest.repos.compareCommitsWithBasehead({
            owner,
            repo,
            basehead,
            per_page: 1,
        });
        logger.debug(`Response from compareCommitsWithBasehead(${basehead}):` +
            `\n${JSON.stringify(response, null, 2)}`);
        return response.data.files;
    }
    catch (error) {
        if (error.status) {
            logger.warning(`Error retrieving diff ${basehead}: ${error.message}`);
            logger.debug(`Error running compareCommitsWithBasehead(${basehead}):` +
                `\nRequest: ${JSON.stringify(error.request, null, 2)}` +
                `\nError Response: ${JSON.stringify(error.response, null, 2)}`);
            return undefined;
        }
        else {
            throw error;
        }
    }
}
function getDiffRanges(fileDiff, logger) {
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
    let additionRangeStartLine = undefined;
    const diffRanges = [];
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
                logger.warning(`Cannot parse diff hunk header for ${fileDiff.filename}: ${diffLine}`);
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
function writeDiffRangeDataExtensionPack(logger, ranges) {
    if (ranges === undefined) {
        return undefined;
    }
    const diffRangeDir = path.join(actionsUtil.getTemporaryDirectory(), "pr-diff-range");
    fs.mkdirSync(diffRangeDir);
    fs.writeFileSync(path.join(diffRangeDir, "qlpack.yml"), `
name: codeql-action/pr-diff-range
version: 0.0.0
library: true
extensionTargets:
  codeql/util: '*'
dataExtensions:
  - pr-diff-range.yml
`);
    const header = `
extensions:
  - addsTo:
      pack: codeql/util
      extensible: restrictAlertsTo
    data:
`;
    let data = ranges
        .map((range) => 
    // Using yaml.dump() with `forceQuotes: true` ensures that all special
    // characters are escaped, and that the path is always rendered as a
    // quoted string on a single line.
    `      - [${yaml.dump(range.path, { forceQuotes: true }).trim()}, ` +
        `${range.startLine}, ${range.endLine}]\n`)
        .join("");
    if (!data) {
        // Ensure that the data extension is not empty, so that a pull request with
        // no edited lines would exclude (instead of accepting) all alerts.
        data = '      - ["", 0, 0]\n';
    }
    const extensionContents = header + data;
    const extensionFilePath = path.join(diffRangeDir, "pr-diff-range.yml");
    fs.writeFileSync(extensionFilePath, extensionContents);
    logger.debug(`Wrote pr-diff-range extension pack to ${extensionFilePath}:\n${extensionContents}`);
    // Write the diff ranges to a JSON file, for action-side alert filtering by the
    // upload-lib module.
    (0, diff_filtering_utils_1.writeDiffRangesJsonFile)(logger, ranges);
    return diffRangeDir;
}
// Runs queries and creates sarif files in the given folder
async function runQueries(sarifFolder, memoryFlag, addSnippetsFlag, threadsFlag, diffRangePackDir, automationDetailsId, config, logger, features) {
    const statusReport = {};
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
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
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
            const analysisSummary = await runInterpretResults(language, undefined, sarifFile, config.debugMode);
            const endTimeInterpretResults = new Date();
            statusReport[`interpret_results_${language}_duration_ms`] =
                endTimeInterpretResults.getTime() - startTimeInterpretResults.getTime();
            logger.endGroup();
            logger.info(analysisSummary);
            if (await features.getValue(feature_flags_1.Feature.QaTelemetryEnabled)) {
                const perQueryAlertCounts = getPerQueryAlertCounts(sarifFile, logger);
                const perQueryAlertCountEventReport = {
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
        }
        catch (e) {
            statusReport.analyze_failure_language = language;
            throw new CodeQLAnalysisError(statusReport, `Error running analysis for ${language}: ${util.getErrorMessage(e)}`, util.wrapError(e));
        }
    }
    return statusReport;
    async function runInterpretResults(language, queries, sarifFile, enableDebugLogging) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        return await codeql.databaseInterpretResults(databasePath, queries, sarifFile, addSnippetsFlag, threadsFlag, enableDebugLogging ? "-vv" : "-v", sarifRunPropertyFlag, automationDetailsId, config, features);
    }
    /** Get an object with all queries and their counts parsed from a SARIF file path. */
    function getPerQueryAlertCounts(sarifPath, log) {
        (0, upload_lib_1.validateSarifFileSchema)(sarifPath, log);
        const sarifObject = JSON.parse(fs.readFileSync(sarifPath, "utf8"));
        // We do not need to compute fingerprints because we are not sending data based off of locations.
        // Generate the query: alert count object
        const perQueryAlertCounts = {};
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
async function runFinalize(outputDir, threadsFlag, memoryFlag, codeql, config, logger) {
    try {
        await (0, del_1.default)(outputDir, { force: true });
    }
    catch (error) {
        if (error?.code !== "ENOENT") {
            throw error;
        }
    }
    await fs.promises.mkdir(outputDir, { recursive: true });
    const timings = await finalizeDatabaseCreation(codeql, config, threadsFlag, memoryFlag, logger);
    // If we didn't already end tracing in the autobuild Action, end it now.
    if (process.env[environment_1.EnvVar.AUTOBUILD_DID_COMPLETE_SUCCESSFULLY] !== "true") {
        await (0, tracer_config_1.endTracingForCluster)(codeql, config, logger);
    }
    return timings;
}
async function warnIfGoInstalledAfterInit(config, logger) {
    // Check that `which go` still points at the same path it did when the `init` Action ran to ensure that no steps
    // in-between performed any setup. We encourage users to perform all setup tasks before initializing CodeQL so that
    // the setup tasks do not interfere with our analysis.
    // Furthermore, if we installed a wrapper script in the `init` Action, we need to ensure that there isn't a step
    // in the workflow after the `init` step which installs a different version of Go and takes precedence in the PATH,
    // thus potentially circumventing our workaround that allows tracing to work.
    const goInitPath = process.env[environment_1.EnvVar.GO_BINARY_LOCATION];
    if (process.env[environment_1.EnvVar.DID_AUTOBUILD_GOLANG] !== "true" &&
        goInitPath !== undefined) {
        const goBinaryPath = await io.which("go", true);
        if (goInitPath !== goBinaryPath) {
            logger.warning(`Expected \`which go\` to return ${goInitPath}, but got ${goBinaryPath}: please ensure that the correct version of Go is installed before the \`codeql-action/init\` Action is used.`);
            (0, diagnostics_1.addDiagnostic)(config, languages_1.Language.go, (0, diagnostics_1.makeDiagnostic)("go/workflow/go-installed-after-codeql-init", "Go was installed after the `codeql-action/init` Action was run", {
                markdownMessage: "To avoid interfering with the CodeQL analysis, perform all installation steps before calling the `github/codeql-action/init` Action.",
                visibility: {
                    statusPage: true,
                    telemetry: true,
                    cliSummaryTable: true,
                },
                severity: "warning",
            }));
        }
    }
}
async function runCleanup(config, cleanupLevel, logger) {
    logger.startGroup("Cleaning up databases");
    for (const language of config.languages) {
        const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
        const databasePath = util.getCodeQLDatabasePath(config, language);
        await codeql.databaseCleanup(databasePath, cleanupLevel);
    }
    logger.endGroup();
}
exports.exportedForTesting = {
    getDiffRanges,
};
//# sourceMappingURL=analyze.js.map