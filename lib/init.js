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
exports.runDatabaseInitCluster = runDatabaseInitCluster;
exports.checkPacksForOverlayCompatibility = checkPacksForOverlayCompatibility;
exports.checkInstallPython311 = checkInstallPython311;
exports.cleanupDatabaseClusterDirectory = cleanupDatabaseClusterDirectory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const io = __importStar(require("@actions/io"));
const yaml = __importStar(require("js-yaml"));
const actions_util_1 = require("./actions-util");
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const util = __importStar(require("./util"));
async function initCodeQL(toolsInput, apiDetails, tempDir, variant, defaultCliVersion, logger) {
    logger.startGroup("Setup CodeQL tools");
    const { codeql, toolsDownloadStatusReport, toolsSource, toolsVersion, zstdAvailability, } = await (0, codeql_1.setupCodeQL)(toolsInput, apiDetails, tempDir, variant, defaultCliVersion, logger, true);
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
async function initConfig(inputs) {
    return await (0, logging_1.withGroupAsync)("Load language configuration", async () => {
        return await configUtils.initConfig(inputs);
    });
}
async function runDatabaseInitCluster(databaseInitEnvironment, codeql, config, sourceRoot, processName, qlconfigFile, logger) {
    fs.mkdirSync(config.dbLocation, { recursive: true });
    await configUtils.wrapEnvironment(databaseInitEnvironment, async () => await codeql.databaseInitCluster(config, sourceRoot, processName, qlconfigFile, logger));
}
/**
 * Check whether all query packs are compatible with the overlay analysis
 * support in the CodeQL CLI. If the check fails, this function will log a
 * warning and returns false.
 *
 * @param codeql A CodeQL instance.
 * @param logger A logger.
 * @returns `true` if all query packs are compatible with overlay analysis,
 * `false` otherwise.
 */
async function checkPacksForOverlayCompatibility(codeql, config, logger) {
    const codeQlOverlayVersion = (await codeql.getVersion()).overlayVersion;
    if (codeQlOverlayVersion === undefined) {
        logger.warning("The CodeQL CLI does not support overlay analysis.");
        return false;
    }
    for (const language of config.languages) {
        const suitePath = util.getGeneratedSuitePath(config, language);
        const packDirs = await codeql.resolveQueriesStartingPacks([suitePath]);
        if (packDirs.some((packDir) => !checkPackForOverlayCompatibility(packDir, codeQlOverlayVersion, logger))) {
            return false;
        }
    }
    return true;
}
/**
 * Check a single pack for its overlay compatibility. If the check fails, this
 * function will log a warning and returns false.
 *
 * @param packDir Path to the directory containing the pack.
 * @param codeQlOverlayVersion The overlay version of the CodeQL CLI.
 * @param logger A logger.
 * @returns `true` if the pack is compatible with overlay analysis, `false`
 * otherwise.
 */
function checkPackForOverlayCompatibility(packDir, codeQlOverlayVersion, logger) {
    try {
        let qlpackPath = path.join(packDir, "qlpack.yml");
        if (!fs.existsSync(qlpackPath)) {
            qlpackPath = path.join(packDir, "codeql-pack.yml");
        }
        const qlpackContents = yaml.load(fs.readFileSync(qlpackPath, "utf8"));
        if (!qlpackContents.buildMetadata) {
            // This is a source-only pack, and overlay compatibility checks apply only
            // to precompiled packs.
            return true;
        }
        const packInfoPath = path.join(packDir, ".packinfo");
        if (!fs.existsSync(packInfoPath)) {
            logger.warning(`The query pack at ${packDir} does not have a .packinfo file, ` +
                "so it cannot support overlay analysis. Recompiling the query pack " +
                "with the latest CodeQL CLI should solve this problem.");
            return false;
        }
        const packInfoFileContents = JSON.parse(fs.readFileSync(packInfoPath, "utf8"));
        const packOverlayVersion = packInfoFileContents.overlayVersion;
        if (typeof packOverlayVersion !== "number") {
            logger.warning(`The .packinfo file for the query pack at ${packDir} ` +
                "does not have the overlayVersion field, which indicates that " +
                "the pack is not compatible with overlay analysis.");
            return false;
        }
        if (packOverlayVersion !== codeQlOverlayVersion) {
            logger.warning(`The query pack at ${packDir} was compiled with ` +
                `overlay version ${packOverlayVersion}, but the CodeQL CLI ` +
                `supports overlay version ${codeQlOverlayVersion}. The ` +
                "query pack needs to be recompiled to support overlay analysis.");
            return false;
        }
    }
    catch (e) {
        logger.warning(`Error while checking pack at ${packDir} ` +
            `for overlay compatibility: ${util.getErrorMessage(e)}`);
        return false;
    }
    return true;
}
/**
 * If we are running python 3.12+ on windows, we need to switch to python 3.11.
 * This check happens in a powershell script.
 */
async function checkInstallPython311(languages, codeql) {
    if (languages.includes(languages_1.KnownLanguage.python) &&
        process.platform === "win32" &&
        !(await codeql.getVersion()).features?.supportsPython312) {
        const script = path.resolve(__dirname, "../python-setup", "check_python12.ps1");
        await new toolrunner.ToolRunner(await io.which("powershell", true), [
            script,
        ]).exec();
    }
}
function cleanupDatabaseClusterDirectory(config, logger, options = {}, 
// We can't stub the fs module in tests, so we allow the caller to override the rmSync function
// for testing.
rmSync = fs.rmSync) {
    if (fs.existsSync(config.dbLocation) &&
        (fs.statSync(config.dbLocation).isFile() ||
            fs.readdirSync(config.dbLocation).length > 0)) {
        if (!options.disableExistingDirectoryWarning) {
            logger.warning(`The database cluster directory ${config.dbLocation} must be empty. Attempting to clean it up.`);
        }
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