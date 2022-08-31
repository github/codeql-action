"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
exports.runPromise = exports.sendStatusReport = void 0;
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
// We need to import `performance` on Node 12
const perf_hooks_1 = require("perf_hooks");
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const api_client_1 = require("./api-client");
const autobuild_1 = require("./autobuild");
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const database_upload_1 = require("./database-upload");
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const trap_caching_1 = require("./trap-caching");
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendStatusReport(startedAt, config, stats, error, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, logger) {
    const status = actionsUtil.getActionsStatus(error, stats === null || stats === void 0 ? void 0 : stats.analyze_failure_language);
    const statusReportBase = await actionsUtil.createStatusReportBase("finish", status, startedAt, error === null || error === void 0 ? void 0 : error.message, error === null || error === void 0 ? void 0 : error.stack);
    const statusReport = {
        ...statusReportBase,
        ...(config
            ? {
                ml_powered_javascript_queries: util.getMlPoweredJsQueriesStatus(config),
            }
            : {}),
        ...(stats || {}),
        ...(dbCreationTimings || {}),
    };
    if (config && didUploadTrapCaches) {
        const trapCacheUploadStatusReport = {
            ...statusReport,
            trap_cache_upload_duration_ms: Math.round(trapCacheUploadTime || 0),
            trap_cache_upload_size_bytes: Math.round(await (0, trap_caching_1.getTotalCacheSize)(config.trapCaches, logger)),
        };
        await actionsUtil.sendStatusReport(trapCacheUploadStatusReport);
    }
    else {
        await actionsUtil.sendStatusReport(statusReport);
    }
}
exports.sendStatusReport = sendStatusReport;
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
    return fs
        .readdirSync(trapDirectory)
        .some((fileName) => [
        ".trap",
        ".trap.gz",
        ".trap.br",
        ".trap.tar.gz",
        ".trap.tar.br",
        ".trap.tar",
    ].some((ext) => fileName.endsWith(ext)));
}
/**
 * When Go extraction reconciliation is enabled, either via the feature flag
 * or an environment variable, we will attempt to autobuild Go to preserve
 * compatibility for users who have set up Go using a legacy scanning style
 * CodeQL workflow, i.e. one without an autobuild step or manual build
 * steps.
 *
 * - We detect whether an autobuild step is present by checking the
 * `CODEQL_ACTION_DID_AUTOBUILD_GOLANG` environment variable, which is set
 * when the autobuilder is invoked.
 * - We approximate whether manual build steps are present by looking at
 * whether any extraction output already exists for Go.
 */
async function runGoAutobuilderIfLegacyWorkflow(config, featureFlags, logger) {
    // Only proceed if the beta Go extraction reconciliation behavior is
    // enabled.
    if (process.env["CODEQL_ACTION_RECONCILE_GO_EXTRACTION"] !== "true" &&
        !(await featureFlags.getValue(feature_flags_1.FeatureFlag.GolangExtractionReconciliationEnabled))) {
        logger.debug("Won't run the Go autobuilder since Go extraction reconciliation is not enabled.");
        return;
    }
    if (!(languages_1.Language.go in config.languages)) {
        logger.info("Won't run the Go autobuilder since Go analysis is not enabled.");
        return;
    }
    if (process.env["CODEQL_ACTION_DID_AUTOBUILD_GOLANG"] === "true") {
        logger.info("Won't run the Go autobuilder since it has already been run.");
        return;
    }
    // This captures whether a user has added manual build steps for Go
    if (doesGoExtractionOutputExist(config)) {
        logger.info("Won't run the Go autobuilder since at least one file of Go code has already been extracted.");
        return;
    }
    await (0, autobuild_1.runAutobuild)(languages_1.Language.go, config, logger);
}
async function run() {
    const startedAt = new Date();
    let uploadResult = undefined;
    let runStats = undefined;
    let config = undefined;
    let trapCacheUploadTime = undefined;
    let dbCreationTimings = undefined;
    let didUploadTrapCaches = false;
    util.initializeEnvironment(util.Mode.actions, pkg.version);
    await util.checkActionVersion(pkg.version);
    const logger = (0, logging_1.getActionsLogger)();
    try {
        if (!(await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("finish", "starting", startedAt)))) {
            return;
        }
        config = await (0, config_utils_1.getConfig)(actionsUtil.getTemporaryDirectory(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        if (hasBadExpectErrorInput()) {
            throw new Error("`expect-error` input parameter is for internal use only. It should only be set by codeql-action or a fork.");
        }
        await util.enrichEnvironment(util.Mode.actions, await (0, codeql_1.getCodeQL)(config.codeQLCmd));
        const apiDetails = {
            auth: actionsUtil.getRequiredInput("token"),
            url: util.getRequiredEnvParam("GITHUB_SERVER_URL"),
            apiURL: util.getRequiredEnvParam("GITHUB_API_URL"),
        };
        const outputDir = actionsUtil.getRequiredInput("output");
        const threads = util.getThreadsFlag(actionsUtil.getOptionalInput("threads") || process.env["CODEQL_THREADS"], logger);
        const memory = util.getMemoryFlag(actionsUtil.getOptionalInput("ram") || process.env["CODEQL_RAM"]);
        const repositoryNwo = (0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY"));
        const gitHubVersion = await (0, api_client_1.getGitHubVersionActionsOnly)();
        const featureFlags = new feature_flags_1.GitHubFeatureFlags(gitHubVersion, apiDetails, repositoryNwo, logger);
        await runGoAutobuilderIfLegacyWorkflow(config, featureFlags, logger);
        dbCreationTimings = await (0, analyze_1.runFinalize)(outputDir, threads, memory, config, logger, featureFlags);
        if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
            runStats = await (0, analyze_1.runQueries)(outputDir, memory, util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")), threads, actionsUtil.getOptionalInput("category"), config, logger);
        }
        if (actionsUtil.getOptionalInput("cleanup-level") !== "none") {
            await (0, analyze_1.runCleanup)(config, actionsUtil.getOptionalInput("cleanup-level") || "brutal", logger);
        }
        const dbLocations = {};
        for (const language of config.languages) {
            dbLocations[language] = util.getCodeQLDatabasePath(config, language);
        }
        core.setOutput("db-locations", dbLocations);
        if (runStats && actionsUtil.getRequiredInput("upload") === "true") {
            uploadResult = await upload_lib.uploadFromActions(outputDir, config.gitHubVersion, apiDetails, logger);
            core.setOutput("sarif-id", uploadResult.sarifID);
        }
        else {
            logger.info("Not uploading results");
        }
        // Possibly upload the database bundles for remote queries
        await (0, database_upload_1.uploadDatabases)(repositoryNwo, config, apiDetails, logger);
        // Possibly upload the TRAP caches for later re-use
        const trapCacheUploadStartTime = perf_hooks_1.performance.now();
        const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
        didUploadTrapCaches = await (0, trap_caching_1.uploadTrapCaches)(codeql, config, logger);
        trapCacheUploadTime = perf_hooks_1.performance.now() - trapCacheUploadStartTime;
        // We don't upload results in test mode, so don't wait for processing
        if (util.isInTestMode()) {
            core.debug("In test mode. Waiting for processing is disabled.");
        }
        else if (uploadResult !== undefined &&
            actionsUtil.getRequiredInput("wait-for-processing") === "true") {
            await upload_lib.waitForProcessing((0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY")), uploadResult.sarifID, apiDetails, (0, logging_1.getActionsLogger)());
        }
        // If we did not throw an error yet here, but we expect one, throw it.
        if (actionsUtil.getOptionalInput("expect-error") === "true") {
            core.setFailed(`expect-error input was set to true but no error was thrown.`);
        }
    }
    catch (origError) {
        const error = origError instanceof Error ? origError : new Error(String(origError));
        if (actionsUtil.getOptionalInput("expect-error") !== "true" ||
            hasBadExpectErrorInput()) {
            core.setFailed(error.message);
        }
        console.log(error);
        if (error instanceof analyze_1.CodeQLAnalysisError) {
            const stats = { ...error.queriesStatusReport };
            await sendStatusReport(startedAt, config, stats, error, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, logger);
        }
        else {
            await sendStatusReport(startedAt, config, undefined, error, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, logger);
        }
        return;
    }
    if (runStats && uploadResult) {
        await sendStatusReport(startedAt, config, {
            ...runStats,
            ...uploadResult.statusReport,
        }, undefined, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, logger);
    }
    else if (runStats) {
        await sendStatusReport(startedAt, config, { ...runStats }, undefined, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, logger);
    }
    else {
        await sendStatusReport(startedAt, config, undefined, undefined, trapCacheUploadTime, dbCreationTimings, didUploadTrapCaches, logger);
    }
}
exports.runPromise = run();
async function runWrapper() {
    try {
        await exports.runPromise;
    }
    catch (error) {
        core.setFailed(`analyze action failed: ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=analyze-action.js.map