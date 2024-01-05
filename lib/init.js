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
Object.defineProperty(exports, "__esModule", { value: true });
exports.installPythonDeps = exports.checkInstallPython311 = exports.runInit = exports.initConfig = exports.initCodeQL = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const languages_1 = require("./languages");
const tracer_config_1 = require("./tracer-config");
const util = __importStar(require("./util"));
async function initCodeQL(toolsInput, apiDetails, tempDir, variant, defaultCliVersion, logger) {
    logger.startGroup("Setup CodeQL tools");
    const { codeql, toolsDownloadDurationMs, toolsSource, toolsVersion } = await (0, codeql_1.setupCodeQL)(toolsInput, apiDetails, tempDir, variant, defaultCliVersion, logger, true);
    await codeql.printVersion();
    logger.endGroup();
    return { codeql, toolsDownloadDurationMs, toolsSource, toolsVersion };
}
exports.initCodeQL = initCodeQL;
async function initConfig(languagesInput, queriesInput, packsInput, configFile, dbLocation, configInput, trapCachingEnabled, debugMode, debugArtifactName, debugDatabaseName, repository, tempDir, codeQL, workspacePath, gitHubVersion, apiDetails, logger) {
    logger.startGroup("Load language configuration");
    const config = await configUtils.initConfig(languagesInput, queriesInput, packsInput, configFile, dbLocation, configInput, trapCachingEnabled, debugMode, debugArtifactName, debugDatabaseName, repository, tempDir, codeQL, workspacePath, gitHubVersion, apiDetails, logger);
    printPathFiltersWarning(config, logger);
    logger.endGroup();
    return config;
}
exports.initConfig = initConfig;
async function runInit(codeql, config, sourceRoot, processName, registriesInput, apiDetails, logger) {
    fs.mkdirSync(config.dbLocation, { recursive: true });
    try {
        const { registriesAuthTokens, qlconfigFile } = await configUtils.generateRegistries(registriesInput, config.tempDir, logger);
        await configUtils.wrapEnvironment({
            GITHUB_TOKEN: apiDetails.auth,
            CODEQL_REGISTRIES_AUTH: registriesAuthTokens,
        }, 
        // Init a database cluster
        async () => await codeql.databaseInitCluster(config, sourceRoot, processName, qlconfigFile, logger));
    }
    catch (e) {
        throw processError(e);
    }
    return await (0, tracer_config_1.getCombinedTracerConfig)(config);
}
exports.runInit = runInit;
function printPathFiltersWarning(config, logger) {
    // Index include/exclude/filters only work in javascript/python/ruby.
    // If any other languages are detected/configured then show a warning.
    if ((config.originalUserInput.paths?.length !== 0 ||
        config.originalUserInput["paths-ignore"]?.length !== 0) &&
        !config.languages.every(languages_1.isScannedLanguage)) {
        logger.warning('The "paths"/"paths-ignore" fields of the config only have effect for JavaScript, Python, and Ruby');
    }
}
/**
 * Possibly convert this error into a UserError in order to avoid
 * counting this error towards our internal error budget.
 *
 * @param e The error to possibly convert to a UserError.
 *
 * @returns A UserError if the error is a known error that can be
 *         attributed to the user, otherwise the original error.
 */
function processError(e) {
    if (!(e instanceof Error)) {
        return e;
    }
    if (
    // Init action called twice
    e.message?.includes("Refusing to create databases") &&
        e.message?.includes("exists and is not an empty directory.")) {
        return new util.UserError(`Is the "init" action called twice in the same job? ${e.message}`);
    }
    if (
    // Version of CodeQL CLI is incompatible with this version of the CodeQL Action
    e.message?.includes("is not compatible with this CodeQL CLI") ||
        // Expected source location for database creation does not exist
        e.message?.includes("Invalid source root")) {
        return new util.UserError(e.message);
    }
    return e;
}
/**
 * If we are running python 3.12+ on windows, we need to switch to python 3.11.
 * This check happens in a powershell script.
 */
async function checkInstallPython311(languages, codeql) {
    if (languages.includes(languages_1.Language.python) &&
        process.platform === "win32" &&
        !(await codeql.getVersion()).features?.supportsPython312) {
        const script = path.resolve(__dirname, "../python-setup", "check_python12.ps1");
        await new toolrunner.ToolRunner(await safeWhich.safeWhich("powershell"), [
            script,
        ]).exec();
    }
}
exports.checkInstallPython311 = checkInstallPython311;
async function installPythonDeps(codeql, logger) {
    logger.startGroup("Setup Python dependencies");
    const scriptsFolder = path.resolve(__dirname, "../python-setup");
    try {
        if (process.platform === "win32") {
            await new toolrunner.ToolRunner(await safeWhich.safeWhich("powershell"), [
                path.join(scriptsFolder, "install_tools.ps1"),
            ]).exec();
        }
        else {
            await new toolrunner.ToolRunner(path.join(scriptsFolder, "install_tools.sh")).exec();
        }
        const script = "auto_install_packages.py";
        if (process.platform === "win32") {
            await new toolrunner.ToolRunner(await safeWhich.safeWhich("py"), [
                "-3",
                "-B",
                path.join(scriptsFolder, script),
                path.dirname(codeql.getPath()),
            ]).exec();
        }
        else {
            await new toolrunner.ToolRunner(await safeWhich.safeWhich("python3"), [
                "-B",
                path.join(scriptsFolder, script),
                path.dirname(codeql.getPath()),
            ]).exec();
        }
    }
    catch (e) {
        logger.endGroup();
        logger.warning(`An error occurred while trying to automatically install Python dependencies: ${e}\n` +
            "Please make sure any necessary dependencies are installed before calling the codeql-action/analyze " +
            "step, and add a 'setup-python-dependencies: false' argument to this step to disable our automatic " +
            "dependency installation and avoid this warning.");
        return;
    }
    logger.endGroup();
}
exports.installPythonDeps = installPythonDeps;
//# sourceMappingURL=init.js.map