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
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCodeQL = initCodeQL;
exports.initConfig = initConfig;
exports.runInit = runInit;
exports.printPathFiltersWarning = printPathFiltersWarning;
exports.checkInstallPython311 = checkInstallPython311;
exports.cleanupDatabaseClusterDirectory = cleanupDatabaseClusterDirectory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const io = __importStar(require("@actions/io"));
const actions_util_1 = require("./actions-util");
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const languages_1 = require("./languages");
const tools_features_1 = require("./tools-features");
const tracer_config_1 = require("./tracer-config");
const util = __importStar(require("./util"));
async function initCodeQL(toolsInput, apiDetails, tempDir, variant, defaultCliVersion, features, logger) {
    logger.startGroup("Setup CodeQL tools");
    const { codeql, toolsDownloadStatusReport, toolsSource, toolsVersion, zstdAvailability, } = await (0, codeql_1.setupCodeQL)(toolsInput, apiDetails, tempDir, variant, defaultCliVersion, logger, features, true);
    await codeql.printVersion();
    logger.endGroup();
    return {
        codeql,
        toolsDownloadStatusReport,
        toolsSource,
        toolsVersion,
        zstdAvailability,
    };
}
async function initConfig(inputs, codeql) {
    const logger = inputs.logger;
    logger.startGroup("Load language configuration");
    const config = await configUtils.initConfig(inputs);
    if (!(await codeql.supportsFeature(tools_features_1.ToolsFeature.InformsAboutUnsupportedPathFilters))) {
        printPathFiltersWarning(config, logger);
    }
    logger.endGroup();
    return config;
}
async function runInit(codeql, config, sourceRoot, processName, registriesInput, apiDetails, logger) {
    fs.mkdirSync(config.dbLocation, { recursive: true });
    const { registriesAuthTokens, qlconfigFile } = await configUtils.generateRegistries(registriesInput, config.tempDir, logger);
    await configUtils.wrapEnvironment({
        GITHUB_TOKEN: apiDetails.auth,
        CODEQL_REGISTRIES_AUTH: registriesAuthTokens,
    }, 
    // Init a database cluster
    async () => await codeql.databaseInitCluster(config, sourceRoot, processName, qlconfigFile, logger));
    return await (0, tracer_config_1.getCombinedTracerConfig)(codeql, config);
}
function printPathFiltersWarning(config, logger) {
    // Index include/exclude/filters only work in javascript/python/ruby.
    // If any other languages are detected/configured then show a warning.
    if ((config.originalUserInput.paths?.length ||
        config.originalUserInput["paths-ignore"]?.length) &&
        !config.languages.every(languages_1.isScannedLanguage)) {
        logger.warning('The "paths"/"paths-ignore" fields of the config only have effect for JavaScript, Python, and Ruby');
    }
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
        await new toolrunner.ToolRunner(await io.which("powershell", true), [
            script,
        ]).exec();
    }
}
function cleanupDatabaseClusterDirectory(config, logger, 
// We can't stub the fs module in tests, so we allow the caller to override the rmSync function
// for testing.
rmSync = fs.rmSync) {
    if (fs.existsSync(config.dbLocation) &&
        (fs.statSync(config.dbLocation).isFile() ||
            fs.readdirSync(config.dbLocation).length)) {
        logger.warning(`The database cluster directory ${config.dbLocation} must be empty. Attempting to clean it up.`);
        try {
            rmSync(config.dbLocation, {
                force: true,
                maxRetries: 3,
                recursive: true,
            });
            logger.info(`Cleaned up database cluster directory ${config.dbLocation}.`);
        }
        catch (e) {
            const blurb = `The CodeQL Action requires an empty database cluster directory. ${(0, actions_util_1.getOptionalInput)("db-location")
                ? `This is currently configured to be ${config.dbLocation}. `
                : `By default, this is located at ${config.dbLocation}. ` +
                    "You can customize it using the 'db-location' input to the init Action. "}An attempt was made to clean up the directory, but this failed.`;
            // Hosted runners are automatically cleaned up, so this error should not occur for hosted runners.
            if ((0, actions_util_1.isSelfHostedRunner)()) {
                throw new util.ConfigurationError(`${blurb} This can happen if another process is using the directory or the directory is owned by a different user. ` +
                    `Please clean up the directory manually and rerun the job. Details: ${util.getErrorMessage(e)}`);
            }
            else {
                throw new Error(`${blurb} This shouldn't typically happen on hosted runners. ` +
                    "If you are using an advanced setup, please check your workflow, otherwise we " +
                    `recommend rerunning the job. Details: ${util.getErrorMessage(e)}`);
            }
        }
    }
}
//# sourceMappingURL=init.js.map