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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const io = __importStar(require("@actions/io"));
const semver = __importStar(require("semver"));
const uuid_1 = require("uuid");
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const caching_utils_1 = require("./caching-utils");
const configUtils = __importStar(require("./config-utils"));
const dependency_caching_1 = require("./dependency-caching");
const diagnostics_1 = require("./diagnostics");
const environment_1 = require("./environment");
const feature_flags_1 = require("./feature-flags");
const init_1 = require("./init");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const setup_codeql_1 = require("./setup-codeql");
const status_report_1 = require("./status-report");
const tools_features_1 = require("./tools-features");
const util_1 = require("./util");
const workflow_1 = require("./workflow");
async function sendCompletedStatusReport(startedAt, config, configFile, toolsDownloadStatusReport, toolsFeatureFlagsValid, toolsSource, toolsVersion, logger, error) {
    const statusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Init, (0, status_report_1.getActionsStatus)(error), startedAt, config, await (0, util_1.checkDiskUsage)(logger), logger, error?.message, error?.stack);
    if (statusReportBase === undefined) {
        return;
    }
    const workflowLanguages = (0, actions_util_1.getOptionalInput)("languages");
    const initStatusReport = {
        ...statusReportBase,
        tools_input: (0, actions_util_1.getOptionalInput)("tools") || "",
        tools_resolved_version: toolsVersion,
        tools_source: toolsSource || setup_codeql_1.ToolsSource.Unknown,
        workflow_languages: workflowLanguages || "",
    };
    const initToolsDownloadFields = {};
    if (toolsDownloadStatusReport?.downloadDurationMs !== undefined) {
        initToolsDownloadFields.tools_download_duration_ms =
            toolsDownloadStatusReport.downloadDurationMs;
    }
    if (toolsFeatureFlagsValid !== undefined) {
        initToolsDownloadFields.tools_feature_flags_valid = toolsFeatureFlagsValid;
    }
    if (config !== undefined) {
        const languages = config.languages.join(",");
        const paths = (config.originalUserInput.paths || []).join(",");
        const pathsIgnore = (config.originalUserInput["paths-ignore"] || []).join(",");
        const disableDefaultQueries = config.originalUserInput["disable-default-queries"]
            ? languages
            : "";
        const queries = [];
        let queriesInput = (0, actions_util_1.getOptionalInput)("queries")?.trim();
        if (queriesInput === undefined || queriesInput.startsWith("+")) {
            queries.push(...(config.originalUserInput.queries || []).map((q) => q.uses));
        }
        if (queriesInput !== undefined) {
            queriesInput = queriesInput.startsWith("+")
                ? queriesInput.slice(1)
                : queriesInput;
            queries.push(...queriesInput.split(","));
        }
        let packs = {};
        if ((config.augmentationProperties.packsInputCombines ||
            !config.augmentationProperties.packsInput) &&
            config.originalUserInput.packs) {
            // Make a copy, because we might modify `packs`.
            const copyPacksFromOriginalUserInput = (0, util_1.cloneObject)(config.originalUserInput.packs);
            // If it is an array, then assume there is only a single language being analyzed.
            if (Array.isArray(copyPacksFromOriginalUserInput)) {
                packs[config.languages[0]] = copyPacksFromOriginalUserInput;
            }
            else {
                packs = copyPacksFromOriginalUserInput;
            }
        }
        if (config.augmentationProperties.packsInput) {
            packs[config.languages[0]] ??= [];
            packs[config.languages[0]].push(...config.augmentationProperties.packsInput);
        }
        // Append fields that are dependent on `config`
        const initWithConfigStatusReport = {
            ...initStatusReport,
            config_file: configFile ?? "",
            disable_default_queries: disableDefaultQueries,
            paths,
            paths_ignore: pathsIgnore,
            queries: queries.join(","),
            packs: JSON.stringify(packs),
            trap_cache_languages: Object.keys(config.trapCaches).join(","),
            trap_cache_download_size_bytes: Math.round(await (0, caching_utils_1.getTotalCacheSize)(Object.values(config.trapCaches), logger)),
            trap_cache_download_duration_ms: Math.round(config.trapCacheDownloadTime),
            query_filters: JSON.stringify(config.originalUserInput["query-filters"] ?? []),
            registries: JSON.stringify(configUtils.parseRegistriesWithoutCredentials((0, actions_util_1.getOptionalInput)("registries")) ?? []),
        };
        await (0, status_report_1.sendStatusReport)({
            ...initWithConfigStatusReport,
            ...initToolsDownloadFields,
        });
    }
    else {
        await (0, status_report_1.sendStatusReport)({ ...initStatusReport, ...initToolsDownloadFields });
    }
}
async function run() {
    const startedAt = new Date();
    const logger = (0, logging_1.getActionsLogger)();
    (0, util_1.initializeEnvironment)((0, actions_util_1.getActionVersion)());
    // Make inputs accessible in the `post` step.
    (0, actions_util_1.persistInputs)();
    let config;
    let codeql;
    let toolsDownloadStatusReport;
    let toolsFeatureFlagsValid;
    let toolsSource;
    let toolsVersion;
    let zstdAvailability;
    const apiDetails = {
        auth: (0, actions_util_1.getRequiredInput)("token"),
        externalRepoAuth: (0, actions_util_1.getOptionalInput)("external-repository-token"),
        url: (0, util_1.getRequiredEnvParam)("GITHUB_SERVER_URL"),
        apiURL: (0, util_1.getRequiredEnvParam)("GITHUB_API_URL"),
    };
    const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
    (0, util_1.checkGitHubVersionInRange)(gitHubVersion, logger);
    (0, util_1.checkActionVersion)((0, actions_util_1.getActionVersion)(), gitHubVersion);
    const repositoryNwo = (0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY"));
    const features = new feature_flags_1.Features(gitHubVersion, repositoryNwo, (0, actions_util_1.getTemporaryDirectory)(), logger);
    const jobRunUuid = (0, uuid_1.v4)();
    logger.info(`Job run UUID is ${jobRunUuid}.`);
    core.exportVariable(environment_1.EnvVar.JOB_RUN_UUID, jobRunUuid);
    core.exportVariable(environment_1.EnvVar.INIT_ACTION_HAS_RUN, "true");
    const configFile = (0, actions_util_1.getOptionalInput)("config-file");
    try {
        const statusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Init, "starting", startedAt, config, await (0, util_1.checkDiskUsage)(logger), logger);
        if (statusReportBase !== undefined) {
            await (0, status_report_1.sendStatusReport)(statusReportBase);
        }
        const codeQLDefaultVersionInfo = await features.getDefaultCliVersion(gitHubVersion.type);
        toolsFeatureFlagsValid = codeQLDefaultVersionInfo.toolsFeatureFlagsValid;
        const initCodeQLResult = await (0, init_1.initCodeQL)((0, actions_util_1.getOptionalInput)("tools"), apiDetails, (0, actions_util_1.getTemporaryDirectory)(), gitHubVersion.type, codeQLDefaultVersionInfo, features, logger);
        codeql = initCodeQLResult.codeql;
        toolsDownloadStatusReport = initCodeQLResult.toolsDownloadStatusReport;
        toolsVersion = initCodeQLResult.toolsVersion;
        toolsSource = initCodeQLResult.toolsSource;
        zstdAvailability = initCodeQLResult.zstdAvailability;
        core.startGroup("Validating workflow");
        const validateWorkflowResult = await (0, workflow_1.validateWorkflow)(codeql, logger);
        if (validateWorkflowResult === undefined) {
            logger.info("Detected no issues with the code scanning workflow.");
        }
        else {
            logger.warning(`Unable to validate code scanning workflow: ${validateWorkflowResult}`);
        }
        core.endGroup();
        config = await (0, init_1.initConfig)({
            languagesInput: (0, actions_util_1.getOptionalInput)("languages"),
            queriesInput: (0, actions_util_1.getOptionalInput)("queries"),
            packsInput: (0, actions_util_1.getOptionalInput)("packs"),
            buildModeInput: (0, actions_util_1.getOptionalInput)("build-mode"),
            configFile,
            dbLocation: (0, actions_util_1.getOptionalInput)("db-location"),
            configInput: (0, actions_util_1.getOptionalInput)("config"),
            trapCachingEnabled: getTrapCachingEnabled(),
            dependencyCachingEnabled: (0, caching_utils_1.getDependencyCachingEnabled)(),
            // Debug mode is enabled if:
            // - The `init` Action is passed `debug: true`.
            // - Actions step debugging is enabled (e.g. by [enabling debug logging for a rerun](https://docs.github.com/en/actions/managing-workflow-runs/re-running-workflows-and-jobs#re-running-all-the-jobs-in-a-workflow),
            //   or by setting the `ACTIONS_STEP_DEBUG` secret to `true`).
            debugMode: (0, actions_util_1.getOptionalInput)("debug") === "true" || core.isDebug(),
            debugArtifactName: (0, actions_util_1.getOptionalInput)("debug-artifact-name") ||
                util_1.DEFAULT_DEBUG_ARTIFACT_NAME,
            debugDatabaseName: (0, actions_util_1.getOptionalInput)("debug-database-name") ||
                util_1.DEFAULT_DEBUG_DATABASE_NAME,
            repository: repositoryNwo,
            tempDir: (0, actions_util_1.getTemporaryDirectory)(),
            codeql,
            workspacePath: (0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE"),
            githubVersion: gitHubVersion,
            apiDetails,
            features,
            logger,
        }, codeql);
        await (0, init_1.checkInstallPython311)(config.languages, codeql);
    }
    catch (unwrappedError) {
        const error = (0, util_1.wrapError)(unwrappedError);
        core.setFailed(error.message);
        const statusReportBase = await (0, status_report_1.createStatusReportBase)(status_report_1.ActionName.Init, error instanceof util_1.ConfigurationError ? "user-error" : "aborted", startedAt, config, await (0, util_1.checkDiskUsage)(logger), logger, error.message, error.stack);
        if (statusReportBase !== undefined) {
            await (0, status_report_1.sendStatusReport)(statusReportBase);
        }
        return;
    }
    try {
        (0, init_1.cleanupDatabaseClusterDirectory)(config, logger);
        if (zstdAvailability) {
            await recordZstdAvailability(config, zstdAvailability);
        }
        // Log CodeQL download telemetry, if appropriate
        if (toolsDownloadStatusReport) {
            (0, diagnostics_1.addDiagnostic)(config, 
            // Arbitrarily choose the first language. We could also choose all languages, but that
            // increases the risk of misinterpreting the data.
            config.languages[0], (0, diagnostics_1.makeDiagnostic)("codeql-action/bundle-download-telemetry", "CodeQL bundle download telemetry", {
                attributes: toolsDownloadStatusReport,
                visibility: {
                    cliSummaryTable: false,
                    statusPage: false,
                    telemetry: true,
                },
            }));
        }
        // Forward Go flags
        const goFlags = process.env["GOFLAGS"];
        if (goFlags) {
            core.exportVariable("GOFLAGS", goFlags);
            core.warning("Passing the GOFLAGS env parameter to the init action is deprecated. Please move this to the analyze action.");
        }
        if (config.languages.includes(languages_1.Language.swift) &&
            process.platform === "linux") {
            logger.warning(`Swift analysis on Ubuntu runner images is no longer supported. Please migrate to a macOS runner if this affects you.`);
        }
        if (config.languages.includes(languages_1.Language.go) &&
            process.platform === "linux") {
            try {
                const goBinaryPath = await io.which("go", true);
                const fileOutput = await (0, actions_util_1.getFileType)(goBinaryPath);
                // Go 1.21 and above ships with statically linked binaries on Linux. CodeQL cannot currently trace custom builds
                // where the entry point is a statically linked binary. Until that is fixed, we work around the problem by
                // replacing the `go` binary with a shell script that invokes the actual `go` binary. Since the shell is
                // typically dynamically linked, this provides a suitable entry point for the CodeQL tracer.
                if (fileOutput.includes("statically linked") &&
                    !(await codeql.supportsFeature(tools_features_1.ToolsFeature.IndirectTracingSupportsStaticBinaries))) {
                    try {
                        logger.debug(`Applying static binary workaround for Go`);
                        // Create a directory that we can add to the system PATH.
                        const tempBinPath = path.resolve((0, actions_util_1.getTemporaryDirectory)(), "codeql-action-go-tracing", "bin");
                        fs.mkdirSync(tempBinPath, { recursive: true });
                        core.addPath(tempBinPath);
                        // Write the wrapper script to the directory we just added to the PATH.
                        const goWrapperPath = path.resolve(tempBinPath, "go");
                        fs.writeFileSync(goWrapperPath, `#!/bin/bash\n\nexec ${goBinaryPath} "$@"`);
                        fs.chmodSync(goWrapperPath, "755");
                        // Store the original location of our wrapper script somewhere where we can
                        // later retrieve it from and cross-check that it hasn't been changed.
                        core.exportVariable(environment_1.EnvVar.GO_BINARY_LOCATION, goWrapperPath);
                    }
                    catch (e) {
                        logger.warning(`Analyzing Go on Linux, but failed to install wrapper script. Tracing custom builds may fail: ${e}`);
                    }
                }
                else {
                    // Store the location of the original Go binary, so we can check that no setup tasks were performed after the
                    // `init` Action ran.
                    core.exportVariable(environment_1.EnvVar.GO_BINARY_LOCATION, goBinaryPath);
                }
            }
            catch (e) {
                logger.warning(`Failed to determine the location of the Go binary: ${e}`);
                if (e instanceof actions_util_1.FileCmdNotFoundError) {
                    (0, diagnostics_1.addDiagnostic)(config, languages_1.Language.go, (0, diagnostics_1.makeDiagnostic)("go/workflow/file-program-unavailable", "The `file` program is required on Linux, but does not appear to be installed", {
                        markdownMessage: "CodeQL was unable to find the `file` program on this system. Ensure that the `file` program is installed on Linux runners and accessible.",
                        visibility: {
                            statusPage: true,
                            telemetry: true,
                            cliSummaryTable: true,
                        },
                        severity: "warning",
                    }));
                }
            }
        }
        // Limit RAM and threads for extractors. When running extractors, the CodeQL CLI obeys the
        // CODEQL_RAM and CODEQL_THREADS environment variables to decide how much RAM and how many
        // threads it would ask extractors to use. See help text for the "--ram" and "--threads"
        // options at https://codeql.github.com/docs/codeql-cli/manual/database-trace-command/
        // for details.
        core.exportVariable("CODEQL_RAM", process.env["CODEQL_RAM"] ||
            (0, util_1.getMemoryFlagValue)((0, actions_util_1.getOptionalInput)("ram"), logger).toString());
        core.exportVariable("CODEQL_THREADS", (0, util_1.getThreadsFlagValue)((0, actions_util_1.getOptionalInput)("threads"), logger).toString());
        // Disable Kotlin extractor if feature flag set
        if (await features.getValue(feature_flags_1.Feature.DisableKotlinAnalysisEnabled)) {
            core.exportVariable("CODEQL_EXTRACTOR_JAVA_AGENT_DISABLE_KOTLIN", "true");
        }
        const kotlinLimitVar = "CODEQL_EXTRACTOR_KOTLIN_OVERRIDE_MAXIMUM_VERSION_LIMIT";
        if ((await (0, util_1.codeQlVersionAtLeast)(codeql, "2.20.3")) &&
            !(await (0, util_1.codeQlVersionAtLeast)(codeql, "2.20.4"))) {
            core.exportVariable(kotlinLimitVar, "2.1.20");
        }
        if (config.languages.includes(languages_1.Language.cpp)) {
            const envVar = "CODEQL_EXTRACTOR_CPP_TRAP_CACHING";
            if (process.env[envVar]) {
                logger.info(`Environment variable ${envVar} already set. Not en/disabling CodeQL C++ TRAP caching support`);
            }
            else if (getTrapCachingEnabled() &&
                (await (0, util_1.codeQlVersionAtLeast)(codeql, "2.17.5"))) {
                logger.info("Enabling CodeQL C++ TRAP caching support");
                core.exportVariable(envVar, "true");
            }
            else {
                logger.info("Disabling CodeQL C++ TRAP caching support");
                core.exportVariable(envVar, "false");
            }
        }
        // Set CODEQL_EXTRACTOR_CPP_BUILD_MODE_NONE
        if (config.languages.includes(languages_1.Language.cpp)) {
            const bmnVar = "CODEQL_EXTRACTOR_CPP_BUILD_MODE_NONE";
            const value = process.env[bmnVar] ||
                (await features.getValue(feature_flags_1.Feature.CppBuildModeNone, codeql));
            logger.info(`Setting C++ build-mode: none to ${value}`);
            core.exportVariable(bmnVar, value);
        }
        // Set CODEQL_ENABLE_EXPERIMENTAL_FEATURES for rust
        if (config.languages.includes(languages_1.Language.rust)) {
            const feat = feature_flags_1.Feature.RustAnalysis;
            const minVer = feature_flags_1.featureConfig[feat].minimumVersion;
            const envVar = "CODEQL_ENABLE_EXPERIMENTAL_FEATURES";
            // if in default setup, it means the feature flag was on when rust was enabled
            // if the feature flag gets turned off, let's not have rust analysis throwing a configuration error
            // in that case rust analysis will be disabled only when default setup is refreshed
            if ((0, actions_util_1.isDefaultSetup)() || (await features.getValue(feat, codeql))) {
                core.exportVariable(envVar, "true");
            }
            if (process.env[envVar] !== "true") {
                throw new util_1.ConfigurationError(`Experimental and not officially supported Rust analysis requires setting ${envVar}=true in the environment`);
            }
            const actualVer = (await codeql.getVersion()).version;
            if (semver.lt(actualVer, minVer)) {
                throw new util_1.ConfigurationError(`Experimental rust analysis is supported by CodeQL CLI version ${minVer} or higher, but found version ${actualVer}`);
            }
            logger.info("Experimental rust analysis enabled");
        }
        // Restore dependency cache(s), if they exist.
        if ((0, caching_utils_1.shouldRestoreCache)(config.dependencyCachingEnabled)) {
            await (0, dependency_caching_1.downloadDependencyCaches)(config.languages, logger);
        }
        // For CLI versions <2.15.1, build tracing caused errors in macOS ARM machines with
        // System Integrity Protection (SIP) disabled.
        if (!(await (0, util_1.codeQlVersionAtLeast)(codeql, "2.15.1")) &&
            process.platform === "darwin" &&
            (process.arch === "arm" || process.arch === "arm64") &&
            !(await (0, util_1.checkSipEnablement)(logger))) {
            logger.warning("CodeQL versions 2.15.0 and lower are not supported on macOS ARM machines with System Integrity Protection (SIP) disabled.");
        }
        // From 2.16.0 the default for the python extractor is to not perform any
        // dependency extraction. For versions before that, you needed to set this flag to
        // enable this behavior.
        if (await (0, util_1.codeQlVersionAtLeast)(codeql, "2.17.1")) {
            // disabled by default, no warning
        }
        else if (await (0, util_1.codeQlVersionAtLeast)(codeql, "2.16.0")) {
            // disabled by default, prints warning if environment variable is not set
            core.exportVariable("CODEQL_EXTRACTOR_PYTHON_DISABLE_LIBRARY_EXTRACTION", "true");
        }
        else {
            core.exportVariable("CODEQL_EXTRACTOR_PYTHON_DISABLE_LIBRARY_EXTRACTION", "true");
        }
        if ((0, actions_util_1.getOptionalInput)("setup-python-dependencies") !== undefined) {
            logger.warning("The setup-python-dependencies input is deprecated and no longer has any effect. We recommend removing any references from your workflows. See https://github.blog/changelog/2024-01-23-codeql-2-16-python-dependency-installation-disabled-new-queries-and-bug-fixes/ for more information.");
        }
        if (process.env["CODEQL_ACTION_DISABLE_PYTHON_DEPENDENCY_INSTALLATION"] !==
            undefined) {
            logger.warning("The CODEQL_ACTION_DISABLE_PYTHON_DEPENDENCY_INSTALLATION environment variable is deprecated and no longer has any effect. We recommend removing any references from your workflows. See https://github.blog/changelog/2024-01-23-codeql-2-16-python-dependency-installation-disabled-new-queries-and-bug-fixes/ for more information.");
        }
        if (await codeql.supportsFeature(tools_features_1.ToolsFeature.PythonDefaultIsToNotExtractStdlib)) {
            if (process.env["CODEQL_EXTRACTOR_PYTHON_EXTRACT_STDLIB"]) {
                logger.debug("CODEQL_EXTRACTOR_PYTHON_EXTRACT_STDLIB is already set, so the Action will not override it.");
            }
            else if (!(await features.getValue(feature_flags_1.Feature.PythonDefaultIsToNotExtractStdlib, codeql))) {
                // We are in a situation where the feature flag is not rolled out,
                // so we need to suppress the new default CLI behavior.
                core.exportVariable("CODEQL_EXTRACTOR_PYTHON_EXTRACT_STDLIB", "true");
            }
        }
        const sourceRoot = path.resolve((0, util_1.getRequiredEnvParam)("GITHUB_WORKSPACE"), (0, actions_util_1.getOptionalInput)("source-root") || "");
        const tracerConfig = await (0, init_1.runInit)(codeql, config, sourceRoot, "Runner.Worker.exe", (0, actions_util_1.getOptionalInput)("registries"), apiDetails, logger);
        if (tracerConfig !== undefined) {
            for (const [key, value] of Object.entries(tracerConfig.env)) {
                core.exportVariable(key, value);
            }
        }
        // Write diagnostics to the database that we previously stored in memory because the database
        // did not exist until now.
        (0, diagnostics_1.flushDiagnostics)(config);
        core.setOutput("codeql-path", config.codeQLCmd);
        core.setOutput("codeql-version", (await codeql.getVersion()).version);
    }
    catch (unwrappedError) {
        const error = (0, util_1.wrapError)(unwrappedError);
        core.setFailed(error.message);
        await sendCompletedStatusReport(startedAt, config, undefined, // We only report config info on success.
        toolsDownloadStatusReport, toolsFeatureFlagsValid, toolsSource, toolsVersion, logger, error);
        return;
    }
    finally {
        (0, diagnostics_1.logUnwrittenDiagnostics)();
    }
    await sendCompletedStatusReport(startedAt, config, configFile, toolsDownloadStatusReport, toolsFeatureFlagsValid, toolsSource, toolsVersion, logger);
}
function getTrapCachingEnabled() {
    // If the workflow specified something always respect that
    const trapCaching = (0, actions_util_1.getOptionalInput)("trap-caching");
    if (trapCaching !== undefined)
        return trapCaching === "true";
    // On self-hosted runners which may have slow network access, disable TRAP caching by default
    if (!(0, util_1.isHostedRunner)())
        return false;
    // On hosted runners, enable TRAP caching by default
    return true;
}
async function recordZstdAvailability(config, zstdAvailability) {
    (0, diagnostics_1.addDiagnostic)(config, 
    // Arbitrarily choose the first language. We could also choose all languages, but that
    // increases the risk of misinterpreting the data.
    config.languages[0], (0, diagnostics_1.makeDiagnostic)("codeql-action/zstd-availability", "Zstandard availability", {
        attributes: zstdAvailability,
        visibility: {
            cliSummaryTable: false,
            statusPage: false,
            telemetry: true,
        },
    }));
}
async function runWrapper() {
    try {
        await run();
    }
    catch (error) {
        core.setFailed(`init action failed: ${(0, util_1.getErrorMessage)(error)}`);
    }
    await (0, util_1.checkForTimeout)();
}
void runWrapper();
//# sourceMappingURL=init-action.js.map