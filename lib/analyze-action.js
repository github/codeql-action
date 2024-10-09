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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPromise = void 0;
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const perf_hooks_1 = require("perf_hooks");
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const api_client_1 = require("./api-client");
const autobuild_1 = require("./autobuild");
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const database_upload_1 = require("./database-upload");
const environment_1 = require("./environment");
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const statusReport = __importStar(require("./status-report"));
const status_report_1 = require("./status-report");
const tools_features_1 = require("./tools-features");
const trap_caching_1 = require("./trap-caching");
const uploadLib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
async function sendStatusReport(startedAt, config, stats, error, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, trapCacheCleanup, logger) {
    const status = (0, status_report_1.getActionsStatus)(error, stats?.analyze_failure_language);
    const statusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Analyze, status, startedAt, config, await util.checkDiskUsage(logger), logger, error?.message, error?.stack);
    if (statusReportBase !== undefined) {
        const report = {
            ...statusReportBase,
            ...(stats || {}),
            ...(dbCreationTimings || {}),
            ...(trapCacheCleanup || {}),
        };
        if (config && didUploadTrapCaches) {
            const trapCacheUploadStatusReport = {
                ...report,
                trap_cache_upload_duration_ms: Math.round(trapCacheUploadTime || 0),
                trap_cache_upload_size_bytes: Math.round(await (0, trap_caching_1.getTotalCacheSize)(config.trapCaches, logger)),
            };
            await statusReport.sendStatusReport(trapCacheUploadStatusReport);
        }
        else {
            await statusReport.sendStatusReport(report);
        }
    }
}
// `expect-error` should only be set to a non-false value by the CodeQL Action PR checks.
function hasBadExpectErrorInput() {
    return (actionsUtil.getOptionalInput("expect-error") !== "false" &&
        !util.isInTestMode());
}
/**
 * Returns whether any TRAP files exist under the `db-go` folder,
 * indicating whether Go extraction has extracted at least one file.
 */
function doesGoExtractionOutputExist(config) {
    const golangDbDirectory = util.getCodeQLDatabasePath(config, languages_1.Language.go);
    const trapDirectory = path_1.default.join(golangDbDirectory, "trap", languages_1.Language.go);
    return (fs.existsSync(trapDirectory) &&
        fs
            .readdirSync(trapDirectory)
            .some((fileName) => [
            ".trap",
            ".trap.gz",
            ".trap.br",
            ".trap.tar.gz",
            ".trap.tar.br",
            ".trap.tar",
        ].some((ext) => fileName.endsWith(ext))));
}
/**
 * We attempt to autobuild Go to preserve compatibility for users who have
 * set up Go using a legacy scanning style CodeQL workflow, i.e. one without
 * an autobuild step or manual build steps.
 *
 * - We detect whether an autobuild step is present by checking the
 * `CODEQL_ACTION_DID_AUTOBUILD_GOLANG` environment variable, which is set
 * when the autobuilder is invoked.
 * - We detect whether the Go database has already been finalized in case it
 * has been manually set in a prior Action step.
 * - We approximate whether manual build steps are present by looking at
 * whether any extraction output already exists for Go.
 */
async function runAutobuildIfLegacyGoWorkflow(config, logger) {
    if (!config.languages.includes(languages_1.Language.go)) {
        return;
    }
    if (config.buildMode) {
        logger.debug("Skipping legacy Go autobuild since a build mode has been specified.");
        return;
    }
    if (process.env[environment_1.EnvVar.DID_AUTOBUILD_GOLANG] === "true") {
        logger.debug("Won't run Go autobuild since it has already been run.");
        return;
    }
    if ((0, analyze_1.dbIsFinalized)(config, languages_1.Language.go, logger)) {
        logger.debug("Won't run Go autobuild since there is already a finalized database for Go.");
        return;
    }
    // This captures whether a user has added manual build steps for Go
    if (doesGoExtractionOutputExist(config)) {
        logger.debug("Won't run Go autobuild since at least one file of Go code has already been extracted.");
        // If the user has run the manual build step, and has set the `CODEQL_EXTRACTOR_GO_BUILD_TRACING`
        // variable, we suggest they remove it from their workflow.
        if ("CODEQL_EXTRACTOR_GO_BUILD_TRACING" in process.env) {
            logger.warning(`The CODEQL_EXTRACTOR_GO_BUILD_TRACING environment variable has no effect on workflows with manual build steps, so we recommend that you remove it from your workflow.`);
        }
        return;
    }
    logger.debug("Running Go autobuild because extraction output (TRAP files) for Go code has not been found.");
    await (0, autobuild_1.runAutobuild)(config, languages_1.Language.go, logger);
}
async function run() {
    const startedAt = new Date();
    let uploadResult = undefined;
    let runStats = undefined;
    let config = undefined;
    let trapCacheCleanupTelemetry = undefined;
    let trapCacheUploadTime = undefined;
    let dbCreationTimings = undefined;
    let didUploadTrapCaches = false;
    util.initializeEnvironment(actionsUtil.getActionVersion());
    const logger = (0, logging_1.getActionsLogger)();
    try {
        const statusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Analyze, "starting", startedAt, config, await util.checkDiskUsage(logger), logger);
        if (statusReportBase !== undefined) {
            await statusReport.sendStatusReport(statusReportBase);
        }
        config = await (0, config_utils_1.getConfig)(actionsUtil.getTemporaryDirectory(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
        if (hasBadExpectErrorInput()) {
            throw new util.ConfigurationError("`expect-error` input parameter is for internal use only. It should only be set by codeql-action or a fork.");
        }
        const apiDetails = (0, api_client_1.getApiDetails)();
        const outputDir = actionsUtil.getRequiredInput("output");
        core.exportVariable(environment_1.EnvVar.SARIF_RESULTS_OUTPUT_DIR, outputDir);
        const threads = util.getThreadsFlag(actionsUtil.getOptionalInput("threads") || process.env["CODEQL_THREADS"], logger);
        const repositoryNwo = (0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY"));
        const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
        util.checkActionVersion(actionsUtil.getActionVersion(), gitHubVersion);
        const features = new feature_flags_1.Features(gitHubVersion, repositoryNwo, actionsUtil.getTemporaryDirectory(), logger);
        const memory = util.getMemoryFlag(actionsUtil.getOptionalInput("ram") || process.env["CODEQL_RAM"], logger);
        core.startGroup("Generating diff range extension pack");
        let diffRangePackDir = undefined;
        if (await codeql.supportsFeature(tools_features_1.ToolsFeature.DatabaseInterpretResultsSupportsSarifRunProperty)) {
            // If we restrict query results using the PR diff range, we need to be
            // able to report that the SARIF output does not contain the full set of
            // results. So only attempt to generate the diff range extension pack if
            // the CodeQL CLI supports --sarif-run-property.
            const diffRanges = await getPullRequestEditedDiffRanges(logger);
            diffRangePackDir = writeDiffRangeDataExtensionPack(logger, diffRanges);
        }
        core.endGroup();
        await (0, analyze_1.warnIfGoInstalledAfterInit)(config, logger);
        await runAutobuildIfLegacyGoWorkflow(config, logger);
        dbCreationTimings = await (0, analyze_1.runFinalize)(outputDir, threads, memory, codeql, config, logger);
        if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
            runStats = await (0, analyze_1.runQueries)(outputDir, memory, util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")), threads, diffRangePackDir, actionsUtil.getOptionalInput("category"), config, logger, features);
        }
        if (actionsUtil.getOptionalInput("cleanup-level") !== "none") {
            await (0, analyze_1.runCleanup)(config, actionsUtil.getOptionalInput("cleanup-level") || "brutal", logger);
        }
        const dbLocations = {};
        for (const language of config.languages) {
            dbLocations[language] = util.getCodeQLDatabasePath(config, language);
        }
        core.setOutput("db-locations", dbLocations);
        core.setOutput("sarif-output", path_1.default.resolve(outputDir));
        const uploadInput = actionsUtil.getOptionalInput("upload");
        if (runStats && actionsUtil.getUploadValue(uploadInput) === "always") {
            uploadResult = await uploadLib.uploadFiles(outputDir, actionsUtil.getRequiredInput("checkout_path"), actionsUtil.getOptionalInput("category"), features, logger);
            core.setOutput("sarif-id", uploadResult.sarifID);
        }
        else {
            logger.info("Not uploading results");
        }
        // Possibly upload the database bundles for remote queries
        await (0, database_upload_1.uploadDatabases)(repositoryNwo, config, apiDetails, logger);
        // Possibly upload the TRAP caches for later re-use
        const trapCacheUploadStartTime = perf_hooks_1.performance.now();
        didUploadTrapCaches = await (0, trap_caching_1.uploadTrapCaches)(codeql, config, logger);
        trapCacheUploadTime = perf_hooks_1.performance.now() - trapCacheUploadStartTime;
        // Clean up TRAP caches
        trapCacheCleanupTelemetry = await (0, trap_caching_1.cleanupTrapCaches)(config, features, logger);
        // We don't upload results in test mode, so don't wait for processing
        if (util.isInTestMode()) {
            logger.debug("In test mode. Waiting for processing is disabled.");
        }
        else if (uploadResult !== undefined &&
            actionsUtil.getRequiredInput("wait-for-processing") === "true") {
            await uploadLib.waitForProcessing((0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY")), uploadResult.sarifID, (0, logging_1.getActionsLogger)());
        }
        // If we did not throw an error yet here, but we expect one, throw it.
        if (actionsUtil.getOptionalInput("expect-error") === "true") {
            core.setFailed(`expect-error input was set to true but no error was thrown.`);
        }
        core.exportVariable(environment_1.EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY, "true");
    }
    catch (unwrappedError) {
        const error = util.wrapError(unwrappedError);
        if (actionsUtil.getOptionalInput("expect-error") !== "true" ||
            hasBadExpectErrorInput()) {
            core.setFailed(error.message);
        }
        await sendStatusReport(startedAt, config, error instanceof analyze_1.CodeQLAnalysisError
            ? error.queriesStatusReport
            : undefined, error instanceof analyze_1.CodeQLAnalysisError ? error.error : error, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, trapCacheCleanupTelemetry, logger);
        return;
    }
    if (runStats && uploadResult) {
        await sendStatusReport(startedAt, config, {
            ...runStats,
            ...uploadResult.statusReport,
        }, undefined, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, trapCacheCleanupTelemetry, logger);
    }
    else if (runStats) {
        await sendStatusReport(startedAt, config, { ...runStats }, undefined, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, trapCacheCleanupTelemetry, logger);
    }
    else {
        await sendStatusReport(startedAt, config, undefined, undefined, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, trapCacheCleanupTelemetry, logger);
    }
}
exports.runPromise = run();
/**
 * Return the file line ranges that were added or modified in the pull request.
 *
 * @param logger
 * @returns An array of tuples, where each tuple contains the absolute path of a
 * file, the start line and the end line (both 1-based and inclusive) of an
 * added or modified range in that file. Returns `undefined` if the action was
 * not triggered by a pull request or if there was an error.
 */
async function getPullRequestEditedDiffRanges(logger) {
    const pull_request = github.context.payload.pull_request;
    if (pull_request === undefined) {
        return undefined;
    }
    const checkoutPath = actionsUtil.getOptionalInput("checkout_path");
    if (checkoutPath === undefined) {
        return undefined;
    }
    const baseRef = pull_request.base.ref;
    const headRef = pull_request.head.ref;
    // To compute the merge bases between the base branch and the PR topic branch,
    // we need to fetch the commit graph from the branch heads to those merge
    // babes. The following 4-step procedure does so while limiting the amount of
    // history fetched.
    // Step 1: Deepen from the PR merge commit to the base branch head and the PR
    // topic branch head, so that the PR merge commit is no longer considered a
    // grafted commit.
    await actionsUtil.deepenGitHistory();
    // Step 2: Fetch the PR topic branch history, stopping when we reach commits
    // that are reachable from the base branch head.
    await actionsUtil.fetchShallowExclude(headRef, baseRef);
    // Step 3: Fetch the base branch history, stopping when we reach commits that
    // are reachable from the PR topic branch head.
    await actionsUtil.fetchShallowExclude(baseRef, headRef);
    // Step 4: Deepen the history so that we have the merge bases between the base
    // branch and the PR topic branch.
    await actionsUtil.deepenGitHistory();
    try {
        const stdout = await actionsUtil.runGitCommand(checkoutPath, ["log", "--graph"], "Cannot retrieve Git log.");
        logger.info(`Git log graph:\n${stdout}`);
    }
    catch {
        // Ignore errors
    }
    // To compute the exact same diff as GitHub would compute for the PR, we need
    // to use the same merge base as GitHub. That is easy to do if there is only
    // one merge base, which is by far the most common case. If there are multiple
    // merge bases, we stop without producing a diff range.
    const mergeBases = await actionsUtil.getAllMergeBases([baseRef, headRef]);
    core.info(`Merge bases: ${mergeBases.join(", ")}`);
    if (mergeBases.length !== 1) {
        return undefined;
    }
    const diffHunkHeaders = await actionsUtil.getGitDiffHunkHeaders(mergeBases[0], headRef);
    if (diffHunkHeaders === undefined) {
        return undefined;
    }
    const results = new Array();
    let changedFile = "";
    for (const line of diffHunkHeaders) {
        // TODO: Handle cases where the file path is quoted and escaped. See help
        // text of git diff for description of the quoted format.
        if (line.startsWith("+++ b/")) {
            changedFile = line.substring(6);
            continue;
        }
        if (line.startsWith("+++ ")) {
            changedFile = "";
            continue;
        }
        if (line.startsWith("@@ ")) {
            if (changedFile === "")
                continue;
            const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
            if (match === null) {
                logger.info(`Failed to parse diff hunk header line: ${line}. Skipping.`);
                continue;
            }
            const startLine = parseInt(match[1], 10);
            const endLine = startLine + (parseInt(match[2], 10) || 1) - 1;
            results.push([path_1.default.join(checkoutPath, changedFile), startLine, endLine]);
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
    const diffRangeDir = path_1.default.join(actionsUtil.getTemporaryDirectory(), "pr-diff-range");
    fs.mkdirSync(diffRangeDir);
    fs.writeFileSync(path_1.default.join(diffRangeDir, "qlpack.yml"), `
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
        .map((range) => {
        return `      - ["${range[0]}", ${range[1]}, ${range[2]}]\n`;
    })
        .join("");
    if (!data) {
        // Ensure that the data extension is not empty, so that a pull request with
        // no edited lines would exclude (instead of accepting) all alerts.
        data = '      - ["", 0, 0]\n';
    }
    const extensionContents = header + data;
    const extensionFilePath = path_1.default.join(diffRangeDir, "pr-diff-range.yml");
    fs.writeFileSync(extensionFilePath, extensionContents);
    logger.info(`Wrote pr-diff-range extension pack to ${extensionFilePath}:\n${extensionContents}`);
    return diffRangeDir;
}
async function runWrapper() {
    try {
        await exports.runPromise;
    }
    catch (error) {
        core.setFailed(`analyze action failed: ${util.getErrorMessage(error)}`);
    }
    await util.checkForTimeout();
}
void runWrapper();
//# sourceMappingURL=analyze-action.js.map