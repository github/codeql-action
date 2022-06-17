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
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const codeql_1 = require("./codeql");
const feature_flags_1 = require("./feature-flags");
const init_1 = require("./init");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendSuccessStatusReport(startedAt, config, toolsVersion) {
    var _a;
    const statusReportBase = await (0, actions_util_1.createStatusReportBase)("init", "success", startedAt);
    const languages = config.languages.join(",");
    const workflowLanguages = (0, actions_util_1.getOptionalInput)("languages");
    const paths = (config.originalUserInput.paths || []).join(",");
    const pathsIgnore = (config.originalUserInput["paths-ignore"] || []).join(",");
    const disableDefaultQueries = config.originalUserInput["disable-default-queries"]
        ? languages
        : "";
    const queries = [];
    let queriesInput = (_a = (0, actions_util_1.getOptionalInput)("queries")) === null || _a === void 0 ? void 0 : _a.trim();
    if (queriesInput === undefined || queriesInput.startsWith("+")) {
        queries.push(...(config.originalUserInput.queries || []).map((q) => q.uses));
    }
    if (queriesInput !== undefined) {
        queriesInput = queriesInput.startsWith("+")
            ? queriesInput.slice(1)
            : queriesInput;
        queries.push(...queriesInput.split(","));
    }
    const statusReport = {
        ...statusReportBase,
        disable_default_queries: disableDefaultQueries,
        languages,
        ml_powered_javascript_queries: (0, util_1.getMlPoweredJsQueriesStatus)(config),
        paths,
        paths_ignore: pathsIgnore,
        queries: queries.join(","),
        tools_input: (0, actions_util_1.getOptionalInput)("tools") || "",
        tools_resolved_version: toolsVersion,
        workflow_languages: workflowLanguages || "",
    };
    await (0, actions_util_1.sendStatusReport)(statusReport);
}
async function run() {
    const startedAt = new Date();
    const logger = (0, logging_1.getActionsLogger)();
    (0, util_1.initializeEnvironment)(util_1.Mode.actions, pkg.version);
    await (0, util_1.checkActionVersion)(pkg.version);
    let config;
    let codeql;
    let toolsVersion;
    const apiDetails = {
        auth: (0, actions_util_1.getRequiredInput)("token"),
        externalRepoAuth: (0, actions_util_1.getOptionalInput)("external-repository-token"),
        url: (0, util_1.getRequiredEnvParam)("GITHUB_SERVER_URL"),
    };
    const gitHubVersion = await (0, api_client_1.getGitHubVersionActionsOnly)();
    (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger, util_1.Mode.actions);
    const repositoryNwo = (0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY"));
    const featureFlags = new feature_flags_1.GitHubFeatureFlags(gitHubVersion, apiDetails, repositoryNwo, logger);
    try {
        const workflowErrors = await (0, actions_util_1.validateWorkflow)();
        if (!(await (0, actions_util_1.sendStatusReport)(await (0, actions_util_1.createStatusReportBase)("init", "starting", startedAt, workflowErrors)))) {
            return;
        }
        const initCodeQLResult = await (0, init_1.initCodeQL)((0, actions_util_1.getOptionalInput)("tools"), apiDetails, (0, actions_util_1.getTemporaryDirectory)(), gitHubVersion.type, logger);
        codeql = initCodeQLResult.codeql;
        toolsVersion = initCodeQLResult.toolsVersion;
        await (0, util_1.enrichEnvironment)(util_1.Mode.actions, codeql);
        config = await (0, init_1.initConfig)((0, actions_util_1.getOptionalInput)("languages"), (0, actions_util_1.getOptionalInput)("queries"), (0, actions_util_1.getOptionalInput)("packs"), (0, actions_util_1.getOptionalInput)("config-file"), (0, actions_util_1.getOptionalInput)("db-location"), (0, actions_util_1.getOptionalInput)("debug") === "true", (0, actions_util_1.getOptionalInput)("debug-artifact-name") || util_1.DEFAULT_DEBUG_ARTIFACT_NAME, (0, actions_util_1.getOptionalInput)("debug-database-name") || util_1.DEFAULT_DEBUG_DATABASE_NAME, repositoryNwo, (0, actions_util_1.getTemporaryDirectory)(), codeql, (0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE"), gitHubVersion, apiDetails, featureFlags, logger);
        if (config.languages.includes(languages_1.Language.python) &&
            (0, actions_util_1.getRequiredInput)("setup-python-dependencies") === "true") {
            try {
                await (0, init_1.installPythonDeps)(codeql, logger);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                logger.warning(`${message} You can call this action with 'setup-python-dependencies: false' to disable this process`);
            }
        }
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        core.setFailed(message);
        console.log(e);
        await (0, actions_util_1.sendStatusReport)(await (0, actions_util_1.createStatusReportBase)("init", "aborted", startedAt, message));
        return;
    }
    try {
        // Forward Go flags
        const goFlags = process.env["GOFLAGS"];
        if (goFlags) {
            core.exportVariable("GOFLAGS", goFlags);
            core.warning("Passing the GOFLAGS env parameter to the init action is deprecated. Please move this to the analyze action.");
        }
        // Limit RAM and threads for extractors. When running extractors, the CodeQL CLI obeys the
        // CODEQL_RAM and CODEQL_THREADS environment variables to decide how much RAM and how many
        // threads it would ask extractors to use. See help text for the "--ram" and "--threads"
        // options at https://codeql.github.com/docs/codeql-cli/manual/database-trace-command/
        // for details.
        core.exportVariable("CODEQL_RAM", process.env["CODEQL_RAM"] ||
            (0, util_1.getMemoryFlagValue)((0, actions_util_1.getOptionalInput)("ram")).toString());
        core.exportVariable("CODEQL_THREADS", (0, util_1.getThreadsFlagValue)((0, actions_util_1.getOptionalInput)("threads"), logger).toString());
        const sourceRoot = path.resolve((0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE"), (0, actions_util_1.getOptionalInput)("source-root") || "");
        const tracerConfig = await (0, init_1.runInit)(codeql, config, sourceRoot, "Runner.Worker.exe", undefined, featureFlags);
        if (tracerConfig !== undefined) {
            for (const [key, value] of Object.entries(tracerConfig.env)) {
                core.exportVariable(key, value);
            }
            if (process.platform === "win32" &&
                !(await (0, util_1.codeQlVersionAbove)(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING))) {
                await (0, init_1.injectWindowsTracer)("Runner.Worker.exe", undefined, config, codeql, tracerConfig);
            }
        }
        core.setOutput("codeql-path", config.codeQLCmd);
    }
    catch (error) {
        core.setFailed(String(error));
        console.log(error);
        await (0, actions_util_1.sendStatusReport)(await (0, actions_util_1.createStatusReportBase)("init", (0, actions_util_1.getActionsStatus)(error), startedAt, String(error), error instanceof Error ? error.stack : undefined));
        return;
    }
    await sendSuccessStatusReport(startedAt, config, toolsVersion);
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`init action failed: ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=init-action.js.map