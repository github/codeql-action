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
const actionsUtil = __importStar(require("./actions-util"));
const init_1 = require("./init");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const util_1 = require("./util");
async function sendSuccessStatusReport(startedAt, config, toolsVersion) {
    var _a;
    const statusReportBase = await actionsUtil.createStatusReportBase("init", "success", startedAt);
    const languages = config.languages.join(",");
    const workflowLanguages = actionsUtil.getOptionalInput("languages");
    const paths = (config.originalUserInput.paths || []).join(",");
    const pathsIgnore = (config.originalUserInput["paths-ignore"] || []).join(",");
    const disableDefaultQueries = config.originalUserInput["disable-default-queries"]
        ? languages
        : "";
    const queries = [];
    let queriesInput = (_a = actionsUtil.getOptionalInput("queries")) === null || _a === void 0 ? void 0 : _a.trim();
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
        tools_input: actionsUtil.getOptionalInput("tools") || "",
        tools_resolved_version: toolsVersion,
    };
    await actionsUtil.sendStatusReport(statusReport);
}
async function run() {
    const startedAt = new Date();
    const logger = logging_1.getActionsLogger();
    let config;
    let codeql;
    let toolsVersion;
    const apiDetails = {
        auth: actionsUtil.getRequiredInput("token"),
        externalRepoAuth: actionsUtil.getOptionalInput("external-repository-token"),
        url: actionsUtil.getRequiredEnvParam("GITHUB_SERVER_URL"),
    };
    const gitHubVersion = await util_1.getGitHubVersion(apiDetails);
    util_1.checkGitHubVersionInRange(gitHubVersion, "actions", logger);
    try {
        actionsUtil.prepareLocalRunEnvironment();
        const workflowErrors = await actionsUtil.validateWorkflow();
        if (!(await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("init", "starting", startedAt, workflowErrors)))) {
            return;
        }
        const initCodeQLResult = await init_1.initCodeQL(actionsUtil.getOptionalInput("tools"), apiDetails, actionsUtil.getTemporaryDirectory(), actionsUtil.getToolCacheDirectory(), "actions", gitHubVersion.type, logger);
        codeql = initCodeQLResult.codeql;
        toolsVersion = initCodeQLResult.toolsVersion;
        config = await init_1.initConfig(actionsUtil.getOptionalInput("languages"), actionsUtil.getOptionalInput("queries"), actionsUtil.getOptionalInput("config-file"), repository_1.parseRepositoryNwo(actionsUtil.getRequiredEnvParam("GITHUB_REPOSITORY")), actionsUtil.getTemporaryDirectory(), actionsUtil.getRequiredEnvParam("RUNNER_TOOL_CACHE"), codeql, actionsUtil.getRequiredEnvParam("GITHUB_WORKSPACE"), gitHubVersion, apiDetails, logger);
        if (config.languages.includes(languages_1.Language.python) &&
            actionsUtil.getRequiredInput("setup-python-dependencies") === "true") {
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
        await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("init", "aborted", startedAt, e.message));
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
        await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("init", "failure", startedAt, error.message, error.stack));
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