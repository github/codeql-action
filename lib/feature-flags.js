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
exports.Features = exports.FEATURE_FLAGS_FILE_NAME = exports.featureConfig = exports.Feature = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const api_client_1 = require("./api-client");
const defaults = __importStar(require("./defaults.json"));
const util = __importStar(require("./util"));
const DEFAULT_VERSION_FEATURE_FLAG_PREFIX = "default_codeql_version_";
const DEFAULT_VERSION_FEATURE_FLAG_SUFFIX = "_enabled";
var Feature;
(function (Feature) {
    Feature["CliAutobuildEnabled"] = "cli_autobuild_enabled";
    Feature["CliConfigFileEnabled"] = "cli_config_file_enabled";
    Feature["DisableKotlinAnalysisEnabled"] = "disable_kotlin_analysis_enabled";
    Feature["ExportCodeScanningConfigEnabled"] = "export_code_scanning_config_enabled";
    Feature["ExportDiagnosticsEnabled"] = "export_diagnostics_enabled";
    Feature["MlPoweredQueriesEnabled"] = "ml_powered_queries_enabled";
    Feature["UploadFailedSarifEnabled"] = "upload_failed_sarif_enabled";
})(Feature = exports.Feature || (exports.Feature = {}));
exports.featureConfig = {
    [Feature.CliAutobuildEnabled]: {
        envVar: "CODEQL_ACTION_USE_CLI_AUTOBUILD",
        minimumVersion: "2.12.5",
        defaultValue: true,
    },
    [Feature.CliConfigFileEnabled]: {
        envVar: "CODEQL_PASS_CONFIG_TO_CLI",
        minimumVersion: "2.11.6",
        defaultValue: true,
    },
    [Feature.DisableKotlinAnalysisEnabled]: {
        envVar: "CODEQL_DISABLE_KOTLIN_ANALYSIS",
        minimumVersion: undefined,
        defaultValue: false,
    },
    [Feature.ExportCodeScanningConfigEnabled]: {
        envVar: "CODEQL_ACTION_EXPORT_CODE_SCANNING_CONFIG",
        minimumVersion: "2.12.3",
        defaultValue: false,
    },
    [Feature.ExportDiagnosticsEnabled]: {
        envVar: "CODEQL_ACTION_EXPORT_DIAGNOSTICS",
        minimumVersion: "2.12.4",
        defaultValue: false,
    },
    [Feature.MlPoweredQueriesEnabled]: {
        envVar: "CODEQL_ML_POWERED_QUERIES",
        minimumVersion: "2.7.5",
        defaultValue: false,
    },
    [Feature.UploadFailedSarifEnabled]: {
        envVar: "CODEQL_ACTION_UPLOAD_FAILED_SARIF",
        minimumVersion: "2.11.3",
        defaultValue: false,
    },
};
exports.FEATURE_FLAGS_FILE_NAME = "cached-feature-flags.json";
/**
 * Determines the enablement status of a number of features.
 * If feature enablement is not able to be determined locally, a request to the
 * GitHub API is made to determine the enablement status.
 */
class Features {
    constructor(gitHubVersion, repositoryNwo, tempDir, logger) {
        this.logger = logger;
        this.gitHubFeatureFlags = new GitHubFeatureFlags(gitHubVersion, repositoryNwo, path.join(tempDir, exports.FEATURE_FLAGS_FILE_NAME), logger);
    }
    async getDefaultCliVersion(variant) {
        return await this.gitHubFeatureFlags.getDefaultCliVersion(variant);
    }
    /**
     *
     * @param feature The feature to check.
     * @param codeql An optional CodeQL object. If provided, and a `minimumVersion` is specified for the
     *        feature, the version of the CodeQL CLI will be checked against the minimum version.
     *        If the version is less than the minimum version, the feature will be considered
     *        disabled. If not provided, and a `minimumVersion` is specified for the feature, the
     *        this function will throw.
     * @returns true if the feature is enabled, false otherwise.
     *
     * @throws if a `minimumVersion` is specified for the feature, and `codeql` is not provided.
     */
    async getValue(feature, codeql) {
        if (!codeql && exports.featureConfig[feature].minimumVersion) {
            throw new Error(`Internal error: A minimum version is specified for feature ${feature}, but no instance of CodeQL was provided.`);
        }
        const envVar = (process.env[exports.featureConfig[feature].envVar] || "").toLocaleLowerCase();
        // Do not use this feature if user explicitly disables it via an environment variable.
        if (envVar === "false") {
            this.logger.debug(`Feature ${feature} is disabled via the environment variable ${exports.featureConfig[feature].envVar}.`);
            return false;
        }
        // Never use this feature if the CLI version explicitly can't support it.
        const minimumVersion = exports.featureConfig[feature].minimumVersion;
        if (codeql && minimumVersion) {
            if (!(await util.codeQlVersionAbove(codeql, minimumVersion))) {
                this.logger.debug(`Feature ${feature} is disabled because the CodeQL CLI version is older than the minimum ` +
                    `version ${minimumVersion}.`);
                return false;
            }
            else {
                this.logger.debug(`CodeQL CLI version ${await codeql.getVersion()} is newer than the minimum ` +
                    `version ${minimumVersion} for feature ${feature}.`);
            }
        }
        // Use this feature if user explicitly enables it via an environment variable.
        if (envVar === "true") {
            this.logger.debug(`Feature ${feature} is enabled via the environment variable ${exports.featureConfig[feature].envVar}.`);
            return true;
        }
        // Ask the GitHub API if the feature is enabled.
        const apiValue = await this.gitHubFeatureFlags.getValue(feature);
        if (apiValue !== undefined) {
            this.logger.debug(`Feature ${feature} is ${apiValue ? "enabled" : "disabled"} via the GitHub API.`);
            return apiValue;
        }
        const defaultValue = exports.featureConfig[feature].defaultValue;
        this.logger.debug(`Feature ${feature} is ${defaultValue ? "enabled" : "disabled"} due to its default value.`);
        return defaultValue;
    }
}
exports.Features = Features;
class GitHubFeatureFlags {
    constructor(gitHubVersion, repositoryNwo, featureFlagsFile, logger) {
        this.gitHubVersion = gitHubVersion;
        this.repositoryNwo = repositoryNwo;
        this.featureFlagsFile = featureFlagsFile;
        this.logger = logger;
        this.hasAccessedRemoteFeatureFlags = false; // Not accessed by default.
    }
    getCliVersionFromFeatureFlag(f) {
        if (!f.startsWith(DEFAULT_VERSION_FEATURE_FLAG_PREFIX) ||
            !f.endsWith(DEFAULT_VERSION_FEATURE_FLAG_SUFFIX)) {
            return undefined;
        }
        const version = f
            .substring(DEFAULT_VERSION_FEATURE_FLAG_PREFIX.length, f.length - DEFAULT_VERSION_FEATURE_FLAG_SUFFIX.length)
            .replace(/_/g, ".");
        if (!semver.valid(version)) {
            this.logger.warning(`Ignoring feature flag ${f} as it does not specify a valid CodeQL version.`);
            return undefined;
        }
        return version;
    }
    async getDefaultCliVersion(variant) {
        if (variant === util.GitHubVariant.DOTCOM) {
            const defaultDotComCliVersion = await this.getDefaultDotcomCliVersion();
            return {
                cliVersion: defaultDotComCliVersion.version,
                toolsFeatureFlagsValid: this.hasAccessedRemoteFeatureFlags
                    ? defaultDotComCliVersion.toolsFeatureFlagsValid
                    : undefined,
                variant,
            };
        }
        return {
            cliVersion: defaults.cliVersion,
            tagName: defaults.bundleVersion,
            variant,
        };
    }
    async getDefaultDotcomCliVersion() {
        const response = await this.getAllFeatures();
        const enabledFeatureFlagCliVersions = Object.entries(response)
            .map(([f, isEnabled]) => isEnabled ? this.getCliVersionFromFeatureFlag(f) : undefined)
            .filter((f) => f !== undefined)
            .map((f) => f);
        if (enabledFeatureFlagCliVersions.length === 0) {
            // We expect at least one default CLI version to be enabled on Dotcom at any time. However if
            // the feature flags are misconfigured, rather than crashing, we fall back to the CLI version
            // shipped with the Action in defaults.json. This has the effect of immediately rolling out
            // new CLI versions to all users running the latest Action.
            //
            // A drawback of this approach relates to the small number of users that run old versions of
            // the Action on Dotcom. As a result of this approach, if we misconfigure the feature flags
            // then these users will experience some alert churn. This is because the CLI version in the
            // defaults.json shipped with an old version of the Action is likely older than the CLI
            // version that would have been specified by the feature flags before they were misconfigured.
            this.logger.warning("Feature flags do not specify a default CLI version. Falling back to the CLI version " +
                `shipped with the Action. This is ${defaults.cliVersion}.`);
            return {
                version: defaults.cliVersion,
                toolsFeatureFlagsValid: this.hasAccessedRemoteFeatureFlags
                    ? false
                    : undefined,
            };
        }
        const maxCliVersion = enabledFeatureFlagCliVersions.reduce((maxVersion, currentVersion) => currentVersion > maxVersion ? currentVersion : maxVersion, enabledFeatureFlagCliVersions[0]);
        this.logger.debug(`Derived default CLI version of ${maxCliVersion} from feature flags.`);
        return { version: maxCliVersion, toolsFeatureFlagsValid: true };
    }
    async getValue(feature) {
        const response = await this.getAllFeatures();
        if (response === undefined) {
            this.logger.debug(`No feature flags API response for ${feature}.`);
            return undefined;
        }
        const features = response[feature];
        if (features === undefined) {
            this.logger.debug(`Feature '${feature}' undefined in API response.`);
            return undefined;
        }
        return !!features;
    }
    async getAllFeatures() {
        // if we have an in memory cache, use that
        if (this.cachedApiResponse !== undefined) {
            return this.cachedApiResponse;
        }
        // if a previous step has written a feature flags file to disk, use that
        const fileFlags = await this.readLocalFlags();
        if (fileFlags !== undefined) {
            this.cachedApiResponse = fileFlags;
            return fileFlags;
        }
        // if not, request flags from the server
        let remoteFlags = await this.loadApiResponse();
        if (remoteFlags === undefined) {
            remoteFlags = {};
        }
        // cache the response in memory
        this.cachedApiResponse = remoteFlags;
        // and cache them to disk so future workflow steps can use them
        await this.writeLocalFlags(remoteFlags);
        return remoteFlags;
    }
    async readLocalFlags() {
        try {
            if (fs.existsSync(this.featureFlagsFile)) {
                this.logger.debug(`Loading feature flags from ${this.featureFlagsFile}`);
                return JSON.parse(fs.readFileSync(this.featureFlagsFile, "utf8"));
            }
        }
        catch (e) {
            this.logger.warning(`Error reading cached feature flags file ${this.featureFlagsFile}: ${e}. Requesting from GitHub instead.`);
        }
        return undefined;
    }
    async writeLocalFlags(flags) {
        try {
            this.logger.debug(`Writing feature flags to ${this.featureFlagsFile}`);
            fs.writeFileSync(this.featureFlagsFile, JSON.stringify(flags));
        }
        catch (e) {
            this.logger.warning(`Error writing cached feature flags file ${this.featureFlagsFile}: ${e}.`);
        }
    }
    async loadApiResponse() {
        // Do nothing when not running against github.com
        if (this.gitHubVersion.type !== util.GitHubVariant.DOTCOM) {
            this.logger.debug("Not running against github.com. Disabling all toggleable features.");
            this.hasAccessedRemoteFeatureFlags = false;
            return {};
        }
        try {
            const response = await (0, api_client_1.getApiClient)().request("GET /repos/:owner/:repo/code-scanning/codeql-action/features", {
                owner: this.repositoryNwo.owner,
                repo: this.repositoryNwo.repo,
            });
            const remoteFlags = response.data;
            this.logger.debug("Loaded the following default values for the feature flags from the Code Scanning API: " +
                `${JSON.stringify(remoteFlags)}`);
            this.hasAccessedRemoteFeatureFlags = true;
            return remoteFlags;
        }
        catch (e) {
            if (util.isHTTPError(e) && e.status === 403) {
                this.logger.warning("This run of the CodeQL Action does not have permission to access Code Scanning API endpoints. " +
                    "As a result, it will not be opted into any experimental features. " +
                    "This could be because the Action is running on a pull request from a fork. If not, " +
                    `please ensure the Action has the 'security-events: write' permission. Details: ${e}`);
                this.hasAccessedRemoteFeatureFlags = false;
                return {};
            }
            else {
                // Some features, such as `ml_powered_queries_enabled` affect the produced alerts.
                // Considering these features disabled in the event of a transient error could
                // therefore lead to alert churn. As a result, we crash if we cannot determine the value of
                // the feature.
                throw new Error(`Encountered an error while trying to determine feature enablement: ${e}`);
            }
        }
    }
}
//# sourceMappingURL=feature-flags.js.map