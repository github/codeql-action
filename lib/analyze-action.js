"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
const analyze_1 = require("./analyze");
const config_utils_1 = require("./config-utils");
const database_upload_1 = require("./database-upload");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
async function sendStatusReport(startedAt, stats, error) {
    var _a, _b, _c;
    const status = ((_a = stats) === null || _a === void 0 ? void 0 : _a.analyze_failure_language) !== undefined || error !== undefined
        ? "failure"
        : "success";
    const statusReportBase = await actionsUtil.createStatusReportBase("finish", status, startedAt, (_b = error) === null || _b === void 0 ? void 0 : _b.message, (_c = error) === null || _c === void 0 ? void 0 : _c.stack);
    const statusReport = {
        ...statusReportBase,
        ...(stats || {}),
    };
    await actionsUtil.sendStatusReport(statusReport);
}
async function run() {
    const startedAt = new Date();
    let stats = undefined;
    let config = undefined;
    util.initializeEnvironment(util.Mode.actions, pkg.version);
    try {
        if (!(await actionsUtil.sendStatusReport(await actionsUtil.createStatusReportBase("finish", "starting", startedAt)))) {
            return;
        }
        const logger = logging_1.getActionsLogger();
        config = await config_utils_1.getConfig(actionsUtil.getTemporaryDirectory(), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. Has the 'init' action been called?");
        }
        const apiDetails = {
            auth: actionsUtil.getRequiredInput("token"),
            url: util.getRequiredEnvParam("GITHUB_SERVER_URL"),
        };
        const outputDir = actionsUtil.getRequiredInput("output");
        const queriesStats = await analyze_1.runAnalyze(outputDir, util.getMemoryFlag(actionsUtil.getOptionalInput("ram")), util.getAddSnippetsFlag(actionsUtil.getRequiredInput("add-snippets")), util.getThreadsFlag(actionsUtil.getOptionalInput("threads"), logger), actionsUtil.getOptionalInput("category"), config, logger);
        if (actionsUtil.getOptionalInput("cleanup-level") !== "none") {
            await analyze_1.runCleanup(config, actionsUtil.getOptionalInput("cleanup-level") || "brutal", logger);
        }
        const dbLocations = {};
        for (const language of config.languages) {
            dbLocations[language] = util.getCodeQLDatabasePath(config, language);
        }
        core.setOutput("db-locations", dbLocations);
        if (actionsUtil.getRequiredInput("upload") === "true") {
            const uploadStats = await upload_lib.uploadFromActions(outputDir, config.gitHubVersion, apiDetails, logger);
            stats = { ...queriesStats, ...uploadStats };
        }
        else {
            logger.info("Not uploading results");
            stats = { ...queriesStats };
        }
        const repositoryNwo = repository_1.parseRepositoryNwo(util.getRequiredEnvParam("GITHUB_REPOSITORY"));
        await database_upload_1.uploadDatabases(repositoryNwo, config, apiDetails, logger);
    }
    catch (error) {
        core.setFailed(error.message);
        console.log(error);
        if (error instanceof analyze_1.CodeQLAnalysisError) {
            stats = { ...error.queriesStatusReport };
        }
        await sendStatusReport(startedAt, stats, error);
        return;
    }
    finally {
        if (core.isDebug() && config !== undefined) {
            core.info("Debug mode is on. Printing CodeQL debug logs...");
            for (const language of config.languages) {
                const databaseDirectory = util.getCodeQLDatabasePath(config, language);
                const logsDirectory = path.join(databaseDirectory, "log");
                const walkLogFiles = (dir) => {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isFile()) {
                            core.startGroup(`CodeQL Debug Logs - ${language} - ${entry.name}`);
                            process.stdout.write(fs.readFileSync(path.resolve(dir, entry.name)));
                            core.endGroup();
                        }
                        else if (entry.isDirectory()) {
                            walkLogFiles(path.resolve(dir, entry.name));
                        }
                    }
                };
                walkLogFiles(logsDirectory);
            }
        }
    }
    await sendStatusReport(startedAt, stats);
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`analyze action failed: ${error}`);
        console.log(error);
    }
}
void runWrapper();
//# sourceMappingURL=analyze-action.js.map