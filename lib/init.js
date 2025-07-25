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
const actions_util_1 = require("./actions-util");
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const languages_1 = require("./languages");
const logging_1 = require("./logging");
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
    const packs = await codeql.resolvePacks();
    const languageQueryPackNames = new Set();
    for (const language of config.languages) {
        languageQueryPackNames.add(`codeql/${language}-queries`);
    }
    for (const step of packs.steps) {
        // The "by-name-and-version" step resolves only packs that are installed
        // locally. In the context of the init action, those would be the packs
        // specified by the workflow to use in the analysis, so we should check them
        // all for overlay compatibility.
        if (step.type === "by-name-and-version") {
            for (const [packName, versionedPacks] of Object.entries(step.found)) {
                for (const [version, versionedPack] of Object.entries(versionedPacks)) {
                    if (!checkPackForOverlayCompatibility(`${packName}@${version}`, versionedPack, codeQlOverlayVersion, logger)) {
                        return false;
                    }
                }
            }
        }
        // The "by-name" step resolves packs in user-specified directives, as well
        // as under the root and the parent of the CodeQL distribution. In the
        // context of the init action, those would be the packs in the CodeQL
        // bundle. We don't want to check every query pack in the bundle: for
        // example, it is ok for the Swift query pack to not support overlay
        // analysis if we are running Ruby analysis. At the same time, we do want to
        // check that the bundled Ruby query pack supports overlay analysis. So here
        // we check only those packs whose names match the languages being analyzed.
        if (step.type === "by-name") {
            for (const scan of step.scans) {
                for (const [packName, packInfo] of Object.entries(scan.found)) {
                    if (languageQueryPackNames.has(packName)) {
                        if (!checkPackForOverlayCompatibility(`${packName}@${packInfo.version}`, packInfo, codeQlOverlayVersion, logger)) {
                            return false;
                        }
                    }
                }
            }
        }
    }
    return true;
}
/**
 * Check a single pack for its overlay compatibility. If the check fails, this
 * function will log a warning and returns false.
 *
 * @param packReference The name and version of the pack, used for logging.
 * @param packInfo Information about the pack, including its path and kind.
 * @param codeQlOverlayVersion The overlay version of the CodeQL CLI.
 * @param logger A logger.
 * @returns `true` if the pack is compatible with overlay analysis, `false`
 * otherwise.
 */
function checkPackForOverlayCompatibility(packReference, packInfo, codeQlOverlayVersion, logger) {
    try {
        if (packInfo.kind !== "query") {
            return true;
        }
        const packInfoPath = path.join(path.dirname(packInfo.path), ".packinfo");
        if (!fs.existsSync(packInfoPath)) {
            logger.warning(`The query pack ${packReference} at ${packInfo.path} ` +
                "does not have a .packinfo file. This pack is too old to support " +
                "overlay analysis.");
            return false;
        }
        const packInfoFileContents = JSON.parse(fs.readFileSync(packInfoPath, "utf8"));
        const packOverlayVersion = packInfoFileContents.overlayVersion;
        if (typeof packOverlayVersion !== "number") {
            logger.warning(`The query pack ${packReference} ` +
                "is not compatible with overlay analysis.");
            return false;
        }
        if (packOverlayVersion !== codeQlOverlayVersion) {
            logger.warning(`The query pack ${packReference} was compiled with ` +
                `overlay version ${packOverlayVersion}, but the CodeQL CLI ` +
                `supports only overlay version ${codeQlOverlayVersion}. The ` +
                "query pack needs to be recompiled to support overlay analysis.");
            return false;
        }
    }
    catch (e) {
        logger.warning(`Error while checking ${packReference} at ${packInfo.path} ` +
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