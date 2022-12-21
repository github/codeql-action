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
const shared_environment_1 = require("./shared-environment");
const trap_caching_1 = require("./trap-caching");
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
const util_1 = require("./util");
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
 * `util.DID_AUTOBUILD_GO_ENV_VAR_NAME` environment variable, which is set
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
    if (process.env[util.DID_AUTOBUILD_GO_ENV_VAR_NAME] === "true") {
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
    util.initializeEnvironment(pkg.version);
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
        await util.enrichEnvironment(await (0, codeql_1.getCodeQL)(config.codeQLCmd));
        const apiDetails = (0, api_client_1.getApiDetails)();
        const outputDir = actionsUtil.getRequiredInput("output");
        const threads = util.getThreadsFlag(actionsUtil.getOptionalInput("threads") || process.env["CODEQL_THREADS"], logger);
        const memory = util.getMemoryFlag(actionsUtil.getOptionalInput("ram") || process.env["CODEQL_RAM"]);
        const repositoryNwo = (0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY"));
        const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
        const features = new feature_flags_1.Features(gitHubVersion, repositoryNwo, actionsUtil.getTemporaryDirectory(), logger);
        await runAutobuildIfLegacyGoWorkflow(config, logger);
        dbCreationTimings = await (0, analyze_1.runFinalize)(outputDir, threads, memory, config, logger);
        if (actionsUtil.getRequiredInput("skip-queries") !== "true") {
            runStats = await (0, analyze_1.runQueries)(outputDir, memory, util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")), threads, actionsUtil.getOptionalInput("category"), config, logger, features);
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
            uploadResult = await upload_lib.uploadFromActions(outputDir, actionsUtil.getRequiredInput("checkout_path"), actionsUtil.getOptionalInput("category"), logger);
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
            await upload_lib.waitForProcessing((0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY")), uploadResult.sarifID, (0, logging_1.getActionsLogger)());
        }
        // If we did not throw an error yet here, but we expect one, throw it.
        if (actionsUtil.getOptionalInput("expect-error") === "true") {
            core.setFailed(`expect-error input was set to true but no error was thrown.`);
        }
        core.exportVariable(shared_environment_1.CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY, "true");
    }
    catch (origError) {
        const error = origError instanceof Error ? origError : new Error(String(origError));
        if (actionsUtil.getOptionalInput("expect-error") !== "true" ||
            hasBadExpectErrorInput()) {
            core.setFailed(error.message);
        }
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
    }
    await (0, util_1.checkForTimeout)();
}
void runWrapper();
//# sourceMappingURL=analyze-action.js.map