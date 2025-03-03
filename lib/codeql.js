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
exports.setupCodeQL = setupCodeQL;
exports.getCodeQL = getCodeQL;
exports.setCodeQL = setCodeQL;
exports.getCachedCodeQL = getCachedCodeQL;
exports.getCodeQLForTesting = getCodeQLForTesting;
exports.getCodeQLForCmd = getCodeQLForCmd;
exports.getExtraOptions = getExtraOptions;
exports.getTrapCachingExtractorConfigArgs = getTrapCachingExtractorConfigArgs;
exports.getTrapCachingExtractorConfigArgsForLang = getTrapCachingExtractorConfigArgsForLang;
exports.getGeneratedCodeScanningConfigPath = getGeneratedCodeScanningConfigPath;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const yaml = __importStar(require("js-yaml"));
const actions_util_1 = require("./actions-util");
const cli_errors_1 = require("./cli-errors");
const doc_url_1 = require("./doc-url");
const environment_1 = require("./environment");
const feature_flags_1 = require("./feature-flags");
const git_utils_1 = require("./git-utils");
const languages_1 = require("./languages");
const setupCodeql = __importStar(require("./setup-codeql"));
const tools_features_1 = require("./tools-features");
const tracer_config_1 = require("./tracer-config");
const util = __importStar(require("./util"));
const util_1 = require("./util");
/**
 * Stores the CodeQL object, and is populated by `setupCodeQL` or `getCodeQL`.
 * Can be overridden in tests using `setCodeQL`.
 */
let cachedCodeQL = undefined;
/**
 * The oldest version of CodeQL that the Action will run with. This should be
 * at least three minor versions behind the current version and must include the
 * CLI versions shipped with each supported version of GHES.
 *
 * The version flags below can be used to conditionally enable certain features
 * on versions newer than this.
 */
const CODEQL_MINIMUM_VERSION = "2.15.5";
/**
 * This version will shortly become the oldest version of CodeQL that the Action will run with.
 */
const CODEQL_NEXT_MINIMUM_VERSION = "2.15.5";
/**
 * This is the version of GHES that was most recently deprecated.
 */
const GHES_VERSION_MOST_RECENTLY_DEPRECATED = "3.11";
/**
 * This is the deprecation date for the version of GHES that was most recently deprecated.
 */
const GHES_MOST_RECENT_DEPRECATION_DATE = "2024-12-19";
/** The CLI verbosity level to use for extraction in debug mode. */
const EXTRACTION_DEBUG_MODE_VERBOSITY = "progress++";
/*
 * Deprecated in favor of ToolsFeature.
 *
 * Versions of CodeQL that version-flag certain functionality in the Action.
 * For convenience, please keep these in descending order. Once a version
 * flag is older than the oldest supported version above, it may be removed.
 */
/**
 * Versions 2.17.1+ of the CodeQL CLI support the `--cache-cleanup` option.
 */
const CODEQL_VERSION_CACHE_CLEANUP = "2.17.1";
/**
 * Set up CodeQL CLI access.
 *
 * @param toolsInput
 * @param apiDetails
 * @param tempDir
 * @param variant
 * @param defaultCliVersion
 * @param logger
 * @param checkVersion Whether to check that CodeQL CLI meets the minimum
 *        version requirement. Must be set to true outside tests.
 * @returns a { CodeQL, toolsVersion } object.
 */
async function setupCodeQL(toolsInput, apiDetails, tempDir, variant, defaultCliVersion, logger, features, checkVersion) {
    try {
        const { codeqlFolder, toolsDownloadStatusReport, toolsSource, toolsVersion, zstdAvailability, } = await setupCodeql.setupCodeQLBundle(toolsInput, apiDetails, tempDir, variant, features, defaultCliVersion, logger);
        logger.debug(`Bundle download status report: ${JSON.stringify(toolsDownloadStatusReport)}`);
        let codeqlCmd = path.join(codeqlFolder, "codeql", "codeql");
        if (process.platform === "win32") {
            codeqlCmd += ".exe";
        }
        else if (process.platform !== "linux" && process.platform !== "darwin") {
            throw new util.ConfigurationError(`Unsupported platform: ${process.platform}`);
        }
        cachedCodeQL = await getCodeQLForCmd(codeqlCmd, checkVersion);
        return {
            codeql: cachedCodeQL,
            toolsDownloadStatusReport,
            toolsSource,
            toolsVersion,
            zstdAvailability,
        };
    }
    catch (e) {
        const ErrorClass = e instanceof util.ConfigurationError ||
            (e instanceof Error && e.message.includes("ENOSPC")) // out of disk space
            ? util.ConfigurationError
            : Error;
        throw new ErrorClass(`Unable to download and extract CodeQL CLI: ${(0, util_1.getErrorMessage)(e)}${e instanceof Error && e.stack ? `\n\nDetails: ${e.stack}` : ""}`);
    }
}
/**
 * Use the CodeQL executable located at the given path.
 */
async function getCodeQL(cmd) {
    if (cachedCodeQL === undefined) {
        cachedCodeQL = await getCodeQLForCmd(cmd, true);
    }
    return cachedCodeQL;
}
function resolveFunction(partialCodeql, methodName, defaultImplementation) {
    if (typeof partialCodeql[methodName] !== "function") {
        if (defaultImplementation !== undefined) {
            return defaultImplementation;
        }
        const dummyMethod = () => {
            throw new Error(`CodeQL ${methodName} method not correctly defined`);
        };
        return dummyMethod;
    }
    return partialCodeql[methodName];
}
/**
 * Set the functionality for CodeQL methods. Only for use in tests.
 *
 * Accepts a partial object and any undefined methods will be implemented
 * to immediately throw an exception indicating which method is missing.
 */
function setCodeQL(partialCodeql) {
    cachedCodeQL = {
        getPath: resolveFunction(partialCodeql, "getPath", () => "/tmp/dummy-path"),
        getVersion: resolveFunction(partialCodeql, "getVersion", async () => ({
            version: "1.0.0",
        })),
        printVersion: resolveFunction(partialCodeql, "printVersion"),
        supportsFeature: resolveFunction(partialCodeql, "supportsFeature", async (feature) => !!partialCodeql.getVersion &&
            (0, tools_features_1.isSupportedToolsFeature)(await partialCodeql.getVersion(), feature)),
        databaseInitCluster: resolveFunction(partialCodeql, "databaseInitCluster"),
        runAutobuild: resolveFunction(partialCodeql, "runAutobuild"),
        extractScannedLanguage: resolveFunction(partialCodeql, "extractScannedLanguage"),
        extractUsingBuildMode: resolveFunction(partialCodeql, "extractUsingBuildMode"),
        finalizeDatabase: resolveFunction(partialCodeql, "finalizeDatabase"),
        resolveLanguages: resolveFunction(partialCodeql, "resolveLanguages"),
        betterResolveLanguages: resolveFunction(partialCodeql, "betterResolveLanguages", async () => ({ aliases: {}, extractors: {} })),
        resolveQueries: resolveFunction(partialCodeql, "resolveQueries"),
        resolveBuildEnvironment: resolveFunction(partialCodeql, "resolveBuildEnvironment"),
        packDownload: resolveFunction(partialCodeql, "packDownload"),
        databaseCleanup: resolveFunction(partialCodeql, "databaseCleanup"),
        databaseBundle: resolveFunction(partialCodeql, "databaseBundle"),
        databaseRunQueries: resolveFunction(partialCodeql, "databaseRunQueries"),
        databaseInterpretResults: resolveFunction(partialCodeql, "databaseInterpretResults"),
        databasePrintBaseline: resolveFunction(partialCodeql, "databasePrintBaseline"),
        databaseExportDiagnostics: resolveFunction(partialCodeql, "databaseExportDiagnostics"),
        diagnosticsExport: resolveFunction(partialCodeql, "diagnosticsExport"),
        resolveExtractor: resolveFunction(partialCodeql, "resolveExtractor"),
        mergeResults: resolveFunction(partialCodeql, "mergeResults"),
    };
    return cachedCodeQL;
}
/**
 * Get the cached CodeQL object. Should only be used from tests.
 *
 * TODO: Work out a good way for tests to get this from the test context
 * instead of having to have this method.
 */
function getCachedCodeQL() {
    if (cachedCodeQL === undefined) {
        // Should never happen as setCodeQL is called by testing-utils.setupTests
        throw new Error("cachedCodeQL undefined");
    }
    return cachedCodeQL;
}
/**
 * Get a real, newly created CodeQL instance for testing. The instance refers to
 * a non-existent placeholder codeql command, so tests that use this function
 * should also stub the toolrunner.ToolRunner constructor.
 */
async function getCodeQLForTesting(cmd = "codeql-for-testing") {
    return getCodeQLForCmd(cmd, false);
}
/**
 * Return a CodeQL object for CodeQL CLI access.
 *
 * @param cmd Path to CodeQL CLI
 * @param checkVersion Whether to check that CodeQL CLI meets the minimum
 *        version requirement. Must be set to true outside tests.
 * @returns A new CodeQL object
 */
async function getCodeQLForCmd(cmd, checkVersion) {
    const codeql = {
        getPath() {
            return cmd;
        },
        async getVersion() {
            let result = util.getCachedCodeQlVersion();
            if (result === undefined) {
                const output = await runCli(cmd, ["version", "--format=json"], {
                    noStreamStdout: true,
                });
                try {
                    result = JSON.parse(output);
                }
                catch {
                    throw Error(`Invalid JSON output from \`version --format=json\`: ${output}`);
                }
                util.cacheCodeQlVersion(result);
            }
            return result;
        },
        async printVersion() {
            await runCli(cmd, ["version", "--format=json"]);
        },
        async supportsFeature(feature) {
            return (0, tools_features_1.isSupportedToolsFeature)(await this.getVersion(), feature);
        },
        async databaseInitCluster(config, sourceRoot, processName, qlconfigFile, logger) {
            const extraArgs = config.languages.map((language) => `--language=${language}`);
            if (await (0, tracer_config_1.shouldEnableIndirectTracing)(codeql, config)) {
                extraArgs.push("--begin-tracing");
                extraArgs.push(...(await getTrapCachingExtractorConfigArgs(config)));
                extraArgs.push(`--trace-process-name=${processName}`);
            }
            if (config.languages.indexOf(languages_1.Language.actions) >= 0) {
                // We originally added an embedded version of the Actions extractor to the CodeQL Action
                // itself in order to deploy the extractor between CodeQL releases. When we did add the
                // extractor to the CLI, though, its autobuild script was missing the execute bit.
                // 2.20.6 is the first CLI release with the fully-functional extractor in the CLI. For older
                // versions, we'll keep using the embedded extractor. We can remove the embedded extractor
                // once 2.20.6 is deployed in the runner images.
                if (!(await util.codeQlVersionAtLeast(codeql, "2.20.6"))) {
                    extraArgs.push("--search-path");
                    const extractorPath = path.resolve(__dirname, "../actions-extractor");
                    extraArgs.push(extractorPath);
                }
            }
            const codeScanningConfigFile = await generateCodeScanningConfig(config, logger);
            const externalRepositoryToken = (0, actions_util_1.getOptionalInput)("external-repository-token");
            extraArgs.push(`--codescanning-config=${codeScanningConfigFile}`);
            if (externalRepositoryToken) {
                extraArgs.push("--external-repository-token-stdin");
            }
            if (config.buildMode !== undefined &&
                (await this.supportsFeature(tools_features_1.ToolsFeature.BuildModeOption))) {
                extraArgs.push(`--build-mode=${config.buildMode}`);
            }
            if (qlconfigFile !== undefined) {
                extraArgs.push(`--qlconfig-file=${qlconfigFile}`);
            }
            const overwriteFlag = (0, tools_features_1.isSupportedToolsFeature)(await this.getVersion(), tools_features_1.ToolsFeature.ForceOverwrite)
                ? "--force-overwrite"
                : "--overwrite";
            await runCli(cmd, [
                "database",
                "init",
                overwriteFlag,
                "--db-cluster",
                config.dbLocation,
                `--source-root=${sourceRoot}`,
                "--calculate-language-specific-baseline",
                "--extractor-include-aliases",
                "--sublanguage-file-coverage",
                ...extraArgs,
                ...getExtraOptionsFromEnv(["database", "init"], {
                    ignoringOptions: ["--overwrite"],
                }),
            ], { stdin: externalRepositoryToken });
        },
        async runAutobuild(config, language) {
            applyAutobuildAzurePipelinesTimeoutFix();
            const autobuildCmd = path.join(await this.resolveExtractor(language), "tools", process.platform === "win32" ? "autobuild.cmd" : "autobuild.sh");
            // Bump the verbosity of the autobuild command if we're in debug mode
            if (config.debugMode) {
                process.env[environment_1.EnvVar.CLI_VERBOSITY] =
                    process.env[environment_1.EnvVar.CLI_VERBOSITY] || EXTRACTION_DEBUG_MODE_VERBOSITY;
            }
            // On macOS, System Integrity Protection (SIP) typically interferes with
            // CodeQL build tracing of protected binaries.
            // The usual workaround is to prefix `$CODEQL_RUNNER` to build commands:
            // `$CODEQL_RUNNER` (not to be confused with the deprecated CodeQL Runner tool)
            // points to a simple wrapper binary included with the CLI, and the extra layer of
            // process indirection helps the tracer bypass SIP.
            // The above SIP workaround is *not* needed here.
            // At the `autobuild` step in the Actions workflow, we assume the `init` step
            // has successfully run, and will have exported `DYLD_INSERT_LIBRARIES`
            // into the environment of subsequent steps, to activate the tracer.
            // When `DYLD_INSERT_LIBRARIES` is set in the environment for a step,
            // the Actions runtime introduces its own workaround for SIP
            // (https://github.com/actions/runner/pull/416).
            await runCli(autobuildCmd);
        },
        async extractScannedLanguage(config, language) {
            await runCli(cmd, [
                "database",
                "trace-command",
                "--index-traceless-dbs",
                ...(await getTrapCachingExtractorConfigArgsForLang(config, language)),
                ...getExtractionVerbosityArguments(config.debugMode),
                ...getExtraOptionsFromEnv(["database", "trace-command"]),
                util.getCodeQLDatabasePath(config, language),
            ]);
        },
        async extractUsingBuildMode(config, language) {
            if (config.buildMode === util_1.BuildMode.Autobuild) {
                applyAutobuildAzurePipelinesTimeoutFix();
            }
            try {
                await runCli(cmd, [
                    "database",
                    "trace-command",
                    "--use-build-mode",
                    "--working-dir",
                    process.cwd(),
                    ...(await getTrapCachingExtractorConfigArgsForLang(config, language)),
                    ...getExtractionVerbosityArguments(config.debugMode),
                    ...getExtraOptionsFromEnv(["database", "trace-command"]),
                    util.getCodeQLDatabasePath(config, language),
                ]);
            }
            catch (e) {
                if (config.buildMode === util_1.BuildMode.Autobuild) {
                    const prefix = "We were unable to automatically build your code. " +
                        "Please change the build mode for this language to manual and specify build steps " +
                        `for your project. See ${doc_url_1.DocUrl.AUTOMATIC_BUILD_FAILED} for more information.`;
                    throw new util.ConfigurationError(`${prefix} ${(0, util_1.getErrorMessage)(e)}`);
                }
                else {
                    throw e;
                }
            }
        },
        async finalizeDatabase(databasePath, threadsFlag, memoryFlag, enableDebugLogging) {
            const args = [
                "database",
                "finalize",
                "--finalize-dataset",
                threadsFlag,
                memoryFlag,
                ...getExtractionVerbosityArguments(enableDebugLogging),
                ...getExtraOptionsFromEnv(["database", "finalize"]),
                databasePath,
            ];
            await runCli(cmd, args);
        },
        async resolveLanguages() {
            const codeqlArgs = [
                "resolve",
                "languages",
                "--format=json",
                ...getExtraOptionsFromEnv(["resolve", "languages"]),
            ];
            const output = await runCli(cmd, codeqlArgs);
            try {
                return JSON.parse(output);
            }
            catch (e) {
                throw new Error(`Unexpected output from codeql resolve languages: ${e}`);
            }
        },
        async betterResolveLanguages() {
            const codeqlArgs = [
                "resolve",
                "languages",
                "--format=betterjson",
                "--extractor-options-verbosity=4",
                "--extractor-include-aliases",
                ...getExtraOptionsFromEnv(["resolve", "languages"]),
            ];
            const output = await runCli(cmd, codeqlArgs);
            try {
                return JSON.parse(output);
            }
            catch (e) {
                throw new Error(`Unexpected output from codeql resolve languages with --format=betterjson: ${e}`);
            }
        },
        async resolveQueries(queries, extraSearchPath) {
            const codeqlArgs = [
                "resolve",
                "queries",
                ...queries,
                "--format=bylanguage",
                ...getExtraOptionsFromEnv(["resolve", "queries"]),
            ];
            if (extraSearchPath !== undefined) {
                codeqlArgs.push("--additional-packs", extraSearchPath);
            }
            const output = await runCli(cmd, codeqlArgs);
            try {
                return JSON.parse(output);
            }
            catch (e) {
                throw new Error(`Unexpected output from codeql resolve queries: ${e}`);
            }
        },
        async resolveBuildEnvironment(workingDir, language) {
            const codeqlArgs = [
                "resolve",
                "build-environment",
                `--language=${language}`,
                "--extractor-include-aliases",
                ...getExtraOptionsFromEnv(["resolve", "build-environment"]),
            ];
            if (workingDir !== undefined) {
                codeqlArgs.push("--working-dir", workingDir);
            }
            const output = await runCli(cmd, codeqlArgs);
            try {
                return JSON.parse(output);
            }
            catch (e) {
                throw new Error(`Unexpected output from codeql resolve build-environment: ${e} in\n${output}`);
            }
        },
        async databaseRunQueries(databasePath, flags) {
            const codeqlArgs = [
                "database",
                "run-queries",
                ...flags,
                databasePath,
                "--expect-discarded-cache",
                "--intra-layer-parallelism",
                "--min-disk-free=1024", // Try to leave at least 1GB free
                "-v",
                ...getExtraOptionsFromEnv(["database", "run-queries"], {
                    ignoringOptions: ["--expect-discarded-cache"],
                }),
            ];
            await runCli(cmd, codeqlArgs);
        },
        async databaseInterpretResults(databasePath, querySuitePaths, sarifFile, addSnippetsFlag, threadsFlag, verbosityFlag, sarifRunPropertyFlag, automationDetailsId, config, features) {
            const shouldExportDiagnostics = await features.getValue(feature_flags_1.Feature.ExportDiagnosticsEnabled, this);
            const codeqlArgs = [
                "database",
                "interpret-results",
                threadsFlag,
                "--format=sarif-latest",
                verbosityFlag,
                `--output=${sarifFile}`,
                addSnippetsFlag,
                "--print-diagnostics-summary",
                "--print-metrics-summary",
                "--sarif-add-baseline-file-info",
                `--sarif-codescanning-config=${getGeneratedCodeScanningConfigPath(config)}`,
                "--sarif-group-rules-by-pack",
                "--sarif-include-query-help=always",
                "--sublanguage-file-coverage",
                ...(await getJobRunUuidSarifOptions(this)),
                ...getExtraOptionsFromEnv(["database", "interpret-results"]),
            ];
            if (sarifRunPropertyFlag !== undefined) {
                codeqlArgs.push(sarifRunPropertyFlag);
            }
            if (automationDetailsId !== undefined) {
                codeqlArgs.push("--sarif-category", automationDetailsId);
            }
            if (shouldExportDiagnostics) {
                codeqlArgs.push("--sarif-include-diagnostics");
            }
            else {
                codeqlArgs.push("--no-sarif-include-diagnostics");
            }
            if (!(0, tools_features_1.isSupportedToolsFeature)(await this.getVersion(), tools_features_1.ToolsFeature.AnalysisSummaryV2IsDefault)) {
                codeqlArgs.push("--new-analysis-summary");
            }
            codeqlArgs.push(databasePath);
            if (querySuitePaths) {
                codeqlArgs.push(...querySuitePaths);
            }
            // Capture the stdout, which contains the analysis summary. Don't stream it to the Actions
            // logs to avoid printing it twice.
            return await runCli(cmd, codeqlArgs, {
                noStreamStdout: true,
            });
        },
        async databasePrintBaseline(databasePath) {
            const codeqlArgs = [
                "database",
                "print-baseline",
                ...getExtraOptionsFromEnv(["database", "print-baseline"]),
                databasePath,
            ];
            return await runCli(cmd, codeqlArgs);
        },
        /**
         * Download specified packs into the package cache. If the specified
         * package and version already exists (e.g., from a previous analysis run),
         * then it is not downloaded again (unless the extra option `--force` is
         * specified).
         *
         * If no version is specified, then the latest version is
         * downloaded. The check to determine what the latest version is is done
         * each time this package is requested.
         *
         * Optionally, a `qlconfigFile` is included. If used, then this file
         * is used to determine which registry each pack is downloaded from.
         */
        async packDownload(packs, qlconfigFile) {
            const qlconfigArg = qlconfigFile
                ? [`--qlconfig-file=${qlconfigFile}`]
                : [];
            const codeqlArgs = [
                "pack",
                "download",
                ...qlconfigArg,
                "--format=json",
                "--resolve-query-specs",
                ...getExtraOptionsFromEnv(["pack", "download"]),
                ...packs,
            ];
            const output = await runCli(cmd, codeqlArgs);
            try {
                const parsedOutput = JSON.parse(output);
                if (Array.isArray(parsedOutput.packs) &&
                    // TODO PackDownloadOutput will not include the version if it is not specified
                    // in the input. The version is always the latest version available.
                    // It should be added to the output, but this requires a CLI change
                    parsedOutput.packs.every((p) => p.name /* && p.version */)) {
                    return parsedOutput;
                }
                else {
                    throw new Error("Unexpected output from pack download");
                }
            }
            catch (e) {
                throw new Error(`Attempted to download specified packs but got an error:\n${output}\n${e}`);
            }
        },
        async databaseCleanup(databasePath, cleanupLevel) {
            const cacheCleanupFlag = (await util.codeQlVersionAtLeast(this, CODEQL_VERSION_CACHE_CLEANUP))
                ? "--cache-cleanup"
                : "--mode";
            const codeqlArgs = [
                "database",
                "cleanup",
                databasePath,
                `${cacheCleanupFlag}=${cleanupLevel}`,
                ...getExtraOptionsFromEnv(["database", "cleanup"]),
            ];
            await runCli(cmd, codeqlArgs);
        },
        async databaseBundle(databasePath, outputFilePath, databaseName) {
            const args = [
                "database",
                "bundle",
                databasePath,
                `--output=${outputFilePath}`,
                `--name=${databaseName}`,
                ...getExtraOptionsFromEnv(["database", "bundle"]),
            ];
            await new toolrunner.ToolRunner(cmd, args).exec();
        },
        async databaseExportDiagnostics(databasePath, sarifFile, automationDetailsId) {
            const args = [
                "database",
                "export-diagnostics",
                `${databasePath}`,
                "--db-cluster", // Database is always a cluster for CodeQL versions that support diagnostics.
                "--format=sarif-latest",
                `--output=${sarifFile}`,
                "--sarif-include-diagnostics", // ExportDiagnosticsEnabled is always true if this command is run.
                "-vvv",
                ...getExtraOptionsFromEnv(["diagnostics", "export"]),
            ];
            if (automationDetailsId !== undefined) {
                args.push("--sarif-category", automationDetailsId);
            }
            await new toolrunner.ToolRunner(cmd, args).exec();
        },
        async diagnosticsExport(sarifFile, automationDetailsId, config) {
            const args = [
                "diagnostics",
                "export",
                "--format=sarif-latest",
                `--output=${sarifFile}`,
                `--sarif-codescanning-config=${getGeneratedCodeScanningConfigPath(config)}`,
                ...getExtraOptionsFromEnv(["diagnostics", "export"]),
            ];
            if (automationDetailsId !== undefined) {
                args.push("--sarif-category", automationDetailsId);
            }
            await new toolrunner.ToolRunner(cmd, args).exec();
        },
        async resolveExtractor(language) {
            // Request it using `format=json` so we don't need to strip the trailing new line generated by
            // the CLI.
            let extractorPath = "";
            await new toolrunner.ToolRunner(cmd, [
                "resolve",
                "extractor",
                "--format=json",
                `--language=${language}`,
                "--extractor-include-aliases",
                ...getExtraOptionsFromEnv(["resolve", "extractor"]),
            ], {
                silent: true,
                listeners: {
                    stdout: (data) => {
                        extractorPath += data.toString();
                    },
                    stderr: (data) => {
                        process.stderr.write(data);
                    },
                },
            }).exec();
            return JSON.parse(extractorPath);
        },
        async mergeResults(sarifFiles, outputFile, { mergeRunsFromEqualCategory = false, }) {
            const args = [
                "github",
                "merge-results",
                "--output",
                outputFile,
                ...getExtraOptionsFromEnv(["github", "merge-results"]),
            ];
            for (const sarifFile of sarifFiles) {
                args.push("--sarif", sarifFile);
            }
            if (mergeRunsFromEqualCategory) {
                args.push("--sarif-merge-runs-from-equal-category");
            }
            await runCli(cmd, args);
        },
    };
    // To ensure that status reports include the CodeQL CLI version wherever
    // possible, we want to call getVersion(), which populates the version value
    // used by status reporting, at the earliest opportunity. But invoking
    // getVersion() directly here breaks tests that only pretend to create a
    // CodeQL object. So instead we rely on the assumption that all non-test
    // callers would set checkVersion to true, and util.codeQlVersionAbove()
    // would call getVersion(), so the CLI version would be cached as soon as the
    // CodeQL object is created.
    if (checkVersion &&
        !(await util.codeQlVersionAtLeast(codeql, CODEQL_MINIMUM_VERSION))) {
        throw new util.ConfigurationError(`Expected a CodeQL CLI with version at least ${CODEQL_MINIMUM_VERSION} but got version ${(await codeql.getVersion()).version}`);
    }
    else if (checkVersion &&
        process.env[environment_1.EnvVar.SUPPRESS_DEPRECATED_SOON_WARNING] !== "true" &&
        !(await util.codeQlVersionAtLeast(codeql, CODEQL_NEXT_MINIMUM_VERSION))) {
        const result = await codeql.getVersion();
        core.warning(`CodeQL CLI version ${result.version} was discontinued on ` +
            `${GHES_MOST_RECENT_DEPRECATION_DATE} alongside GitHub Enterprise Server ` +
            `${GHES_VERSION_MOST_RECENTLY_DEPRECATED} and will not be supported by the next minor ` +
            `release of the CodeQL Action. Please update to CodeQL CLI version ` +
            `${CODEQL_NEXT_MINIMUM_VERSION} or later. For instance, if you have specified a custom ` +
            "version of the CLI using the 'tools' input to the 'init' Action, you can remove this " +
            "input to use the default version.\n\n" +
            "Alternatively, if you want to continue using CodeQL CLI version " +
            `${result.version}, you can replace 'github/codeql-action/*@v${(0, actions_util_1.getActionVersion)().split(".")[0]}' by 'github/codeql-action/*@v${(0, actions_util_1.getActionVersion)()}' in your code scanning workflow to ` +
            "continue using this version of the CodeQL Action.");
        core.exportVariable(environment_1.EnvVar.SUPPRESS_DEPRECATED_SOON_WARNING, "true");
    }
    return codeql;
}
/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 *
 * @param ignoringOptions Options that should be ignored, for example because they have already
 *                        been passed and it is an error to pass them more than once.
 */
function getExtraOptionsFromEnv(paths, { ignoringOptions } = {}) {
    const options = util.getExtraOptionsEnvParam();
    return getExtraOptions(options, paths, []).filter((option) => !ignoringOptions?.includes(option));
}
/**
 * Gets `options` as an array of extra option strings.
 *
 * - throws an exception mentioning `pathInfo` if this conversion is impossible.
 */
function asExtraOptions(options, pathInfo) {
    if (options === undefined) {
        return [];
    }
    if (!Array.isArray(options)) {
        const msg = `The extra options for '${pathInfo.join(".")}' ('${JSON.stringify(options)}') are not in an array.`;
        throw new Error(msg);
    }
    return options.map((o) => {
        const t = typeof o;
        if (t !== "string" && t !== "number" && t !== "boolean") {
            const msg = `The extra option for '${pathInfo.join(".")}' ('${JSON.stringify(o)}') is not a primitive value.`;
            throw new Error(msg);
        }
        return `${o}`;
    });
}
/**
 * Gets the options for `path` of `options` as an array of extra option strings.
 *
 * - the special terminal step name '*' in `options` matches all path steps
 * - throws an exception if this conversion is impossible.
 *
 * Exported for testing.
 */
function getExtraOptions(options, paths, pathInfo) {
    const all = asExtraOptions(options?.["*"], pathInfo.concat("*"));
    const specific = paths.length === 0
        ? asExtraOptions(options, pathInfo)
        : getExtraOptions(options?.[paths[0]], paths?.slice(1), pathInfo.concat(paths[0]));
    return all.concat(specific);
}
async function runCli(cmd, args = [], opts = {}) {
    try {
        return await (0, actions_util_1.runTool)(cmd, args, opts);
    }
    catch (e) {
        if (e instanceof actions_util_1.CommandInvocationError) {
            throw (0, cli_errors_1.wrapCliConfigurationError)(new cli_errors_1.CliError(e));
        }
        throw e;
    }
}
/**
 * Generates a code scanning configuration that is to be used for a scan.
 *
 * @param codeql The CodeQL object to use.
 * @param config The configuration to use.
 * @returns the path to the generated user configuration file.
 */
async function generateCodeScanningConfig(config, logger) {
    const codeScanningConfigFile = getGeneratedCodeScanningConfigPath(config);
    // make a copy so we can modify it
    const augmentedConfig = (0, util_1.cloneObject)(config.originalUserInput);
    // Inject the queries from the input
    if (config.augmentationProperties.queriesInput) {
        if (config.augmentationProperties.queriesInputCombines) {
            augmentedConfig.queries = (augmentedConfig.queries || []).concat(config.augmentationProperties.queriesInput);
        }
        else {
            augmentedConfig.queries = config.augmentationProperties.queriesInput;
        }
    }
    if (augmentedConfig.queries?.length === 0) {
        delete augmentedConfig.queries;
    }
    // Inject the packs from the input
    if (config.augmentationProperties.packsInput) {
        if (config.augmentationProperties.packsInputCombines) {
            // At this point, we already know that this is a single-language analysis
            if (Array.isArray(augmentedConfig.packs)) {
                augmentedConfig.packs = (augmentedConfig.packs || []).concat(config.augmentationProperties.packsInput);
            }
            else if (!augmentedConfig.packs) {
                augmentedConfig.packs = config.augmentationProperties.packsInput;
            }
            else {
                // At this point, we know there is only one language.
                // If there were more than one language, an error would already have been thrown.
                const language = Object.keys(augmentedConfig.packs)[0];
                augmentedConfig.packs[language] = augmentedConfig.packs[language].concat(config.augmentationProperties.packsInput);
            }
        }
        else {
            augmentedConfig.packs = config.augmentationProperties.packsInput;
        }
    }
    if (Array.isArray(augmentedConfig.packs) && !augmentedConfig.packs.length) {
        delete augmentedConfig.packs;
    }
    logger.info(`Writing augmented user configuration file to ${codeScanningConfigFile}`);
    logger.startGroup("Augmented user configuration file contents");
    logger.info(yaml.dump(augmentedConfig));
    logger.endGroup();
    fs.writeFileSync(codeScanningConfigFile, yaml.dump(augmentedConfig));
    return codeScanningConfigFile;
}
// This constant sets the size of each TRAP cache in megabytes.
const TRAP_CACHE_SIZE_MB = 1024;
async function getTrapCachingExtractorConfigArgs(config) {
    const result = [];
    for (const language of config.languages)
        result.push(await getTrapCachingExtractorConfigArgsForLang(config, language));
    return result.flat();
}
async function getTrapCachingExtractorConfigArgsForLang(config, language) {
    const cacheDir = config.trapCaches[language];
    if (cacheDir === undefined)
        return [];
    const write = await (0, git_utils_1.isAnalyzingDefaultBranch)();
    return [
        `-O=${language}.trap.cache.dir=${cacheDir}`,
        `-O=${language}.trap.cache.bound=${TRAP_CACHE_SIZE_MB}`,
        `-O=${language}.trap.cache.write=${write}`,
    ];
}
/**
 * Get the path to the code scanning configuration generated by the CLI.
 *
 * This will not exist if the configuration is being parsed in the Action.
 */
function getGeneratedCodeScanningConfigPath(config) {
    return path.resolve(config.tempDir, "user-config.yaml");
}
function getExtractionVerbosityArguments(enableDebugLogging) {
    return enableDebugLogging
        ? [`--verbosity=${EXTRACTION_DEBUG_MODE_VERBOSITY}`]
        : [];
}
/**
 * Updates the `JAVA_TOOL_OPTIONS` environment variable to resolve an issue with Azure Pipelines
 * timing out connections after 4 minutes and Maven not properly handling closed connections.
 *
 * Without the fix, long build processes will timeout when pulling down Java packages
 * https://developercommunity.visualstudio.com/content/problem/292284/maven-hosted-agent-connection-timeout.html
 */
function applyAutobuildAzurePipelinesTimeoutFix() {
    const javaToolOptions = process.env["JAVA_TOOL_OPTIONS"] || "";
    process.env["JAVA_TOOL_OPTIONS"] = [
        ...javaToolOptions.split(/\s+/),
        "-Dhttp.keepAlive=false",
        "-Dmaven.wagon.http.pool=false",
    ].join(" ");
}
async function getJobRunUuidSarifOptions(codeql) {
    const jobRunUuid = process.env[environment_1.EnvVar.JOB_RUN_UUID];
    return jobRunUuid &&
        (await codeql.supportsFeature(tools_features_1.ToolsFeature.DatabaseInterpretResultsSupportsSarifRunProperty))
        ? [`--sarif-run-property=jobRunUuid=${jobRunUuid}`]
        : [];
}
//# sourceMappingURL=codeql.js.map