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
exports.CodeQLAnalysisError = void 0;
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
const safe_which_1 = require("@chrisgavin/safe-which");
const del_1 = __importDefault(require("del"));
const yaml = __importStar(require("js-yaml"));
const actionsUtil = __importStar(require("./actions-util"));
const autobuild_1 = require("./autobuild");
const codeql_1 = require("./codeql");
const diagnostics_1 = require("./diagnostics");
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
 * @param headRef The head branch name, used for calculating the diff range.
 * @param codeql
 * @param logger
 * @param features
 * @returns Absolute path to the directory containing the extension pack for
 * the diff range information, or `undefined` if the feature is disabled.
 */
async function setupDiffInformedQueryRun(baseRef, headRef, codeql, logger, features) {
    if (!(await features.getValue(feature_flags_1.Feature.DiffInformedQueries, codeql))) {
        return undefined;
    }
    return await (0, logging_1.withGroup)("Generating diff range extension pack", async () => {
        const diffRanges = await getPullRequestEditedDiffRanges(baseRef, headRef, logger);
        return writeDiffRangeDataExtensionPack(logger, diffRanges);
    });
}
/**
 * Return the file line ranges that were added or modified in the pull request.
 *
 * @param baseRef The base branch name, used for calculating the diff range.
 * @param headRef The head branch name, used for calculating the diff range.
 * @param logger
 * @returns An array of tuples, where each tuple contains the absolute path of a
 * file, the start line and the end line (both 1-based and inclusive) of an
 * added or modified range in that file. Returns `undefined` if the action was
 * not triggered by a pull request or if there was an error.
 */
async function getPullRequestEditedDiffRanges(baseRef, headRef, logger) {
    const checkoutPath = actionsUtil.getOptionalInput("checkout_path");
    if (checkoutPath === undefined) {
        return undefined;
    }
    // To compute the merge bases between the base branch and the PR topic branch,
    // we need to fetch the commit graph from the branch heads to those merge
    // babes. The following 4-step procedure does so while limiting the amount of
    // history fetched.
    // Step 1: Deepen from the PR merge commit to the base branch head and the PR
    // topic branch head, so that the PR merge commit is no longer considered a
    // grafted commit.
    await actionsUtil.deepenGitHistory();
    // Step 2: Fetch the base branch shallow history. This step ensures that the
    // base branch name is present in the local repository. Normally the base
    // branch name would be added by Step 4. However, if the base branch head is
    // an ancestor of the PR topic branch head, Step 4 would fail without doing
    // anything, so we need to fetch the base branch explicitly.
    await actionsUtil.gitFetch(baseRef, ["--depth=1"]);
    // Step 3: Fetch the PR topic branch history, stopping when we reach commits
    // that are reachable from the base branch head.
    await actionsUtil.gitFetch(headRef, [`--shallow-exclude=${baseRef}`]);
    // Step 4: Fetch the base branch history, stopping when we reach commits that
    // are reachable from the PR topic branch head.
    await actionsUtil.gitFetch(baseRef, [`--shallow-exclude=${headRef}`]);
    // Step 5: Deepen the history so that we have the merge bases between the base
    // branch and the PR topic branch.
    await actionsUtil.deepenGitHistory();
    // To compute the exact same diff as GitHub would compute for the PR, we need
    // to use the same merge base as GitHub. That is easy to do if there is only
    // one merge base, which is by far the most common case. If there are multiple
    // merge bases, we stop without producing a diff range.
    const mergeBases = await actionsUtil.getAllGitMergeBases([baseRef, headRef]);
    logger.info(`Merge bases: ${mergeBases.join(", ")}`);
    if (mergeBases.length !== 1) {
        logger.info("Cannot compute diff range because baseRef and headRef " +
            `have ${mergeBases.length} merge bases (instead of exactly 1).`);
        return undefined;
    }
    const diffHunkHeaders = await actionsUtil.getGitDiffHunkHeaders(mergeBases[0], headRef);
    if (diffHunkHeaders === undefined) {
        return undefined;
    }
    const results = new Array();
    let changedFile = "";
    for (const line of diffHunkHeaders) {
        if (line.startsWith("+++ ")) {
            const filePath = actionsUtil.decodeGitFilePath(line.substring(4));
            if (filePath.startsWith("b/")) {
                // The file was edited: track all hunks in the file
                changedFile = filePath.substring(2);
            }
            else if (filePath === "/dev/null") {
                // The file was deleted: skip all hunks in the file
                changedFile = "";
            }
            else {
                logger.warning(`Failed to parse diff hunk header line: ${line}`);
                return undefined;
            }
            continue;
        }
        if (line.startsWith("@@ ")) {
            if (changedFile === "")
                continue;
            const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
            if (match === null) {
                logger.warning(`Failed to parse diff hunk header line: ${line}`);
                return undefined;
            }
            const startLine = parseInt(match[1], 10);
            const numLines = parseInt(match[2], 10);
            if (numLines === 0) {
                // The hunk was a deletion: skip it
                continue;
            }
            const endLine = startLine + (numLines || 1) - 1;
            results.push({
                path: path.join(checkoutPath, changedFile),
                startLine,
                endLine,
            });
        }
    }
    return results;
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
        .map((range) => `      - ["${range[0]}", ${range[1]}, ${range[2]}]\n`)
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
    return diffRangeDir;
}
// Runs queries and creates sarif files in the given folder
async function runQueries(sarifFolder, memoryFlag, addSnippetsFlag, threadsFlag, diffRangePackDir, automationDetailsId, config, logger, features) {
    const statusReport = {};
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
            if (!(await util.codeQlVersionAtLeast(codeql, codeql_1.CODEQL_VERSION_ANALYSIS_SUMMARY_V2))) {
                await runPrintLinesOfCode(language);
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
    async function runPrintLinesOfCode(language) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        return await codeql.databasePrintBaseline(databasePath);
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
        const goBinaryPath = await (0, safe_which_1.safeWhich)("go");
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
//# sourceMappingURL=analyze.js.map