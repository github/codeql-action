"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const actions_util_1 = require("./actions-util");
const init_1 = require("./init");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendSuccessStatusReport(startedAt, config, toolsVersion) {
    var _a;
    const statusReportBase = await actions_util_1.createStatusReportBase("init", "success", startedAt);
    const languages = config.languages.join(",");
    const workflowLanguages = actions_util_1.getOptionalInput("languages");
    const paths = (config.originalUserInput.paths || []).join(",");
    const pathsIgnore = (config.originalUserInput["paths-ignore"] || []).join(",");
    const disableDefaultQueries = config.originalUserInput["disable-default-queries"]
        ? languages
        : "";
    const queries = [];
    let queriesInput = (_a = actions_util_1.getOptionalInput("queries")) === null || _a === void 0 ? void 0 : _a.trim();
    if (queriesInput === undefined || queriesInput.startsWith("+")) {
        queries.push(...(config.originalUserInput.queries || []).map((q) => q.uses));
    }
    if (queriesInput !== undefined) {
        queriesInput = queriesInput.startsWith("+")
            ? queriesInput.substr(1)
            : queriesInput;
        queries.push(...queriesInput.split(","));
    }
    const statusReport = {
        ...statusReportBase,
        languages,
        workflow_languages: workflowLanguages || "",
        paths,
        paths_ignore: pathsIgnore,
        disable_default_queries: disableDefaultQueries,
        queries: queries.join(","),
        tools_input: actions_util_1.getOptionalInput("tools") || "",
        tools_resolved_version: toolsVersion,
    };
    await actions_util_1.sendStatusReport(statusReport);
}
async function run() {
    const startedAt = new Date();
    const logger = logging_1.getActionsLogger();
    util_1.initializeEnvironment(util_1.Mode.actions, pkg.version);
    let config;
    let codeql;
    let toolsVersion;
    const apiDetails = {
        auth: actions_util_1.getRequiredInput("token"),
        externalRepoAuth: actions_util_1.getOptionalInput("external-repository-token"),
        url: util_1.getRequiredEnvParam("GITHUB_SERVER_URL"),
    };
    const gitHubVersion = await util_1.getGitHubVersion(apiDetails);
    util_1.checkGitHubVersionInRange(gitHubVersion, logger, util_1.Mode.actions);
    try {
        const workflowErrors = await actions_util_1.validateWorkflow();
        if (!(await actions_util_1.sendStatusReport(await actions_util_1.createStatusReportBase("init", "starting", startedAt, workflowErrors)))) {
            return;
        }
        const initCodeQLResult = await init_1.initCodeQL(actions_util_1.getOptionalInput("tools"), apiDetails, actions_util_1.getTemporaryDirectory(), actions_util_1.getToolCacheDirectory(), gitHubVersion.type, logger);
        codeql = initCodeQLResult.codeql;
        toolsVersion = initCodeQLResult.toolsVersion;
        config = await init_1.initConfig(actions_util_1.getOptionalInput("languages"), actions_util_1.getOptionalInput("queries"), actions_util_1.getOptionalInput("config-file"), actions_util_1.getOptionalInput("db-location"), repository_1.parseRepositoryNwo(util_1.getRequiredEnvParam("GITHUB_REPOSITORY")), actions_util_1.getTemporaryDirectory(), util_1.getRequiredEnvParam("RUNNER_TOOL_CACHE"), codeql, util_1.getRequiredEnvParam("GITHUB_WORKSPACE"), gitHubVersion, apiDetails, logger);
        if (config.languages.includes(languages_1.Language.python) &&
            actions_util_1.getRequiredInput("setup-python-dependencies") === "true") {
            try {
                await init_1.installPythonDeps(codeql, logger);
            }
            catch (err) {
                logger.warning(`${err.message} You can call this action with 'setup-python-dependencies: false' to disable this process`);
            }
        }
    }
    catch (e) {
        core.setFailed(e.message);
        console.log(e);
        await actions_util_1.sendStatusReport(await actions_util_1.createStatusReportBase("init", "aborted", startedAt, e.message));
        return;
    }
    try {
        // Forward Go flags
        const goFlags = process.env["GOFLAGS"];
        if (goFlags) {
            core.exportVariable("GOFLAGS", goFlags);
            core.warning("Passing the GOFLAGS env parameter to the init action is deprecated. Please move this to the analyze action.");
        }
        // Setup CODEQL_RAM flag (todo improve this https://github.com/github/dsp-code-scanning/issues/935)
        const codeqlRam = process.env["CODEQL_RAM"] || "6500";
        core.exportVariable("CODEQL_RAM", codeqlRam);
        const tracerConfig = await init_1.runInit(codeql, config);
        if (tracerConfig !== undefined) {
            for (const [key, value] of Object.entries(tracerConfig.env)) {
                core.exportVariable(key, value);
            }
            if (process.platform === "win32") {
                await init_1.injectWindowsTracer("Runner.Worker.exe", undefined, config, codeql, tracerConfig);
            }
        }
        core.setOutput("codeql-path", config.codeQLCmd);
    }
    catch (error) {
        core.setFailed(error.message);
        console.log(error);
        await actions_util_1.sendStatusReport(await actions_util_1.createStatusReportBase("init", "failure", startedAt, error.message, error.stack));
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