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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeArtifactName = sanitizeArtifactName;
exports.uploadCombinedSarifArtifacts = uploadCombinedSarifArtifacts;
exports.tryUploadAllAvailableDebugArtifacts = tryUploadAllAvailableDebugArtifacts;
exports.uploadDebugArtifacts = uploadDebugArtifacts;
exports.getArtifactUploaderClient = getArtifactUploaderClient;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const artifact = __importStar(require("@actions/artifact"));
const artifactLegacy = __importStar(require("@actions/artifact-legacy"));
const core = __importStar(require("@actions/core"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const del_1 = __importDefault(require("del"));
const actions_util_1 = require("./actions-util");
const analyze_1 = require("./analyze");
const codeql_1 = require("./codeql");
const environment_1 = require("./environment");
const logging_1 = require("./logging");
const tools_features_1 = require("./tools-features");
const util_1 = require("./util");
function sanitizeArtifactName(name) {
    return name.replace(/[^a-zA-Z0-9_\\-]+/g, "");
}
/**
 * Upload Actions SARIF artifacts for debugging when CODEQL_ACTION_DEBUG_COMBINED_SARIF
 * environment variable is set
 */
async function uploadCombinedSarifArtifacts(logger, gitHubVariant, codeQlVersion) {
    const tempDir = (0, actions_util_1.getTemporaryDirectory)();
    // Upload Actions SARIF artifacts for debugging when environment variable is set
    if (process.env["CODEQL_ACTION_DEBUG_COMBINED_SARIF"] === "true") {
        await (0, logging_1.withGroup)("Uploading combined SARIF debug artifact", async () => {
            logger.info("Uploading available combined SARIF files as Actions debugging artifact...");
            const baseTempDir = path.resolve(tempDir, "combined-sarif");
            const toUpload = [];
            if (fs.existsSync(baseTempDir)) {
                const outputDirs = fs.readdirSync(baseTempDir);
                for (const outputDir of outputDirs) {
                    const sarifFiles = fs
                        .readdirSync(path.resolve(baseTempDir, outputDir))
                        .filter((f) => f.endsWith(".sarif"));
                    for (const sarifFile of sarifFiles) {
                        toUpload.push(path.resolve(baseTempDir, outputDir, sarifFile));
                    }
                }
            }
            try {
                await uploadDebugArtifacts(logger, toUpload, baseTempDir, "combined-sarif-artifacts", gitHubVariant, codeQlVersion);
            }
            catch (e) {
                logger.warning(`Failed to upload combined SARIF files as Actions debugging artifact. Reason: ${(0, util_1.getErrorMessage)(e)}`);
            }
        });
    }
}
/**
 * Try to prepare a SARIF result debug artifact for the given language.
 *
 * @return The path to that debug artifact, or undefined if an error occurs.
 */
function tryPrepareSarifDebugArtifact(config, language, logger) {
    try {
        const analyzeActionOutputDir = process.env[environment_1.EnvVar.SARIF_RESULTS_OUTPUT_DIR];
        if (analyzeActionOutputDir !== undefined &&
            fs.existsSync(analyzeActionOutputDir) &&
            fs.lstatSync(analyzeActionOutputDir).isDirectory()) {
            const sarifFile = path.resolve(analyzeActionOutputDir, `${language}.sarif`);
            // Move SARIF to DB location so that they can be uploaded with the same root directory as the other artifacts.
            if (fs.existsSync(sarifFile)) {
                const sarifInDbLocation = path.resolve(config.dbLocation, `${language}.sarif`);
                fs.copyFileSync(sarifFile, sarifInDbLocation);
                return sarifInDbLocation;
            }
        }
    }
    catch (e) {
        logger.warning(`Failed to find SARIF results path for ${language}. Reason: ${(0, util_1.getErrorMessage)(e)}`);
    }
    return undefined;
}
/**
 * Try to bundle the database for the given language.
 *
 * @return The path to the database bundle, or undefined if an error occurs.
 */
async function tryBundleDatabase(config, language, logger) {
    try {
        if ((0, analyze_1.dbIsFinalized)(config, language, logger)) {
            try {
                return await createDatabaseBundleCli(config, language);
            }
            catch (e) {
                logger.warning(`Failed to bundle database for ${language} using the CLI. ` +
                    `Falling back to a partial bundle. Reason: ${(0, util_1.getErrorMessage)(e)}`);
            }
        }
        return await createPartialDatabaseBundle(config, language);
    }
    catch (e) {
        logger.warning(`Failed to bundle database for ${language}. Reason: ${(0, util_1.getErrorMessage)(e)}`);
        return undefined;
    }
}
/**
 * Attempt to upload all available debug artifacts.
 *
 * Logs and suppresses any errors that occur.
 */
async function tryUploadAllAvailableDebugArtifacts(config, logger, codeQlVersion) {
    const filesToUpload = [];
    try {
        for (const language of config.languages) {
            await (0, logging_1.withGroup)(`Uploading debug artifacts for ${language}`, async () => {
                logger.info("Preparing SARIF result debug artifact...");
                const sarifResultDebugArtifact = tryPrepareSarifDebugArtifact(config, language, logger);
                if (sarifResultDebugArtifact) {
                    filesToUpload.push(sarifResultDebugArtifact);
                    logger.info("SARIF result debug artifact ready for upload.");
                }
                logger.info("Preparing database logs debug artifact...");
                const databaseDirectory = (0, util_1.getCodeQLDatabasePath)(config, language);
                const logsDirectory = path.resolve(databaseDirectory, "log");
                if ((0, util_1.doesDirectoryExist)(logsDirectory)) {
                    filesToUpload.push(...(0, util_1.listFolder)(logsDirectory));
                    logger.info("Database logs debug artifact ready for upload.");
                }
                // Multilanguage tracing: there are additional logs in the root of the cluster
                logger.info("Preparing database cluster logs debug artifact...");
                const multiLanguageTracingLogsDirectory = path.resolve(config.dbLocation, "log");
                if ((0, util_1.doesDirectoryExist)(multiLanguageTracingLogsDirectory)) {
                    filesToUpload.push(...(0, util_1.listFolder)(multiLanguageTracingLogsDirectory));
                    logger.info("Database cluster logs debug artifact ready for upload.");
                }
                // Add database bundle
                logger.info("Preparing database bundle debug artifact...");
                const databaseBundle = await tryBundleDatabase(config, language, logger);
                if (databaseBundle) {
                    filesToUpload.push(databaseBundle);
                    logger.info("Database bundle debug artifact ready for upload.");
                }
            });
        }
    }
    catch (e) {
        logger.warning(`Failed to prepare debug artifacts. Reason: ${(0, util_1.getErrorMessage)(e)}`);
        return;
    }
    try {
        await (0, logging_1.withGroup)("Uploading debug artifacts", async () => uploadDebugArtifacts(logger, filesToUpload, config.dbLocation, config.debugArtifactName, config.gitHubVersion.type, codeQlVersion));
    }
    catch (e) {
        logger.warning(`Failed to upload debug artifacts. Reason: ${(0, util_1.getErrorMessage)(e)}`);
    }
}
async function uploadDebugArtifacts(logger, toUpload, rootDir, artifactName, ghVariant, codeQlVersion) {
    if (toUpload.length === 0) {
        return "no-artifacts-to-upload";
    }
    const uploadSupported = (0, tools_features_1.isSafeArtifactUpload)(codeQlVersion);
    if (!uploadSupported) {
        core.info(`Skipping debug artifact upload because the current CLI does not support safe upload. Please upgrade to CLI v${tools_features_1.SafeArtifactUploadVersion} or later.`);
        return "upload-not-supported";
    }
    let suffix = "";
    const matrix = (0, actions_util_1.getOptionalInput)("matrix");
    if (matrix) {
        try {
            for (const [, matrixVal] of Object.entries(JSON.parse(matrix)).sort())
                suffix += `-${matrixVal}`;
        }
        catch {
            core.info("Could not parse user-specified `matrix` input into JSON. The debug artifact will not be named with the user's `matrix` input.");
        }
    }
    const artifactUploader = await getArtifactUploaderClient(logger, ghVariant);
    try {
        await artifactUploader.uploadArtifact(sanitizeArtifactName(`${artifactName}${suffix}`), toUpload.map((file) => path.normalize(file)), path.normalize(rootDir), {
            // ensure we don't keep the debug artifacts around for too long since they can be large.
            retentionDays: 7,
        });
        return "upload-successful";
    }
    catch (e) {
        // A failure to upload debug artifacts should not fail the entire action.
        core.warning(`Failed to upload debug artifacts: ${e}`);
        return "upload-failed";
    }
}
// `@actions/artifact@v2` is not yet supported on GHES so the legacy version of the client will be used on GHES
// until it is supported. We also use the legacy version of the client if the feature flag is disabled.
// The feature flag is named `ArtifactV4Upgrade` to reduce customer confusion; customers are primarily affected by
// `actions/download-artifact`, whose upgrade to v4 must be accompanied by the `@actions/artifact@v2` upgrade.
async function getArtifactUploaderClient(logger, ghVariant) {
    if (ghVariant === util_1.GitHubVariant.GHES) {
        logger.info("Debug artifacts can be consumed with `actions/download-artifact@v3` because the `v4` version is not yet compatible on GHES.");
        return artifactLegacy.create();
    }
    else {
        logger.info("Debug artifacts can be consumed with `actions/download-artifact@v4`.");
        return new artifact.DefaultArtifactClient();
    }
}
/**
 * If a database has not been finalized, we cannot run the `codeql database bundle`
 * command in the CLI because it will return an error. Instead we directly zip
 * all files in the database folder and return the path.
 */
async function createPartialDatabaseBundle(config, language) {
    const databasePath = (0, util_1.getCodeQLDatabasePath)(config, language);
    const databaseBundlePath = path.resolve(config.dbLocation, `${config.debugDatabaseName}-${language}-partial.zip`);
    core.info(`${config.debugDatabaseName}-${language} is not finalized. Uploading partial database bundle at ${databaseBundlePath}...`);
    // See `bundleDb` for explanation behind deleting existing db bundle.
    if (fs.existsSync(databaseBundlePath)) {
        await (0, del_1.default)(databaseBundlePath, { force: true });
    }
    const zip = new adm_zip_1.default();
    zip.addLocalFolder(databasePath);
    zip.writeZip(databaseBundlePath);
    return databaseBundlePath;
}
/**
 * Runs `codeql database bundle` command and returns the path.
 */
async function createDatabaseBundleCli(config, language) {
    const databaseBundlePath = await (0, util_1.bundleDb)(config, language, await (0, codeql_1.getCodeQL)(config.codeQLCmd), `${config.debugDatabaseName}-${language}`);
    return databaseBundlePath;
}
//# sourceMappingURL=debug-artifacts.js.map