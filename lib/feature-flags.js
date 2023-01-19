"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
const MINIMUM_ENABLED_CODEQL_VERSION = "2.11.6";
var Feature;
(function (Feature) {
    Feature["BypassToolcacheEnabled"] = "bypass_toolcache_enabled";
    Feature["BypassToolcacheKotlinSwiftEnabled"] = "bypass_toolcache_kotlin_swift_enabled";
    Feature["CliConfigFileEnabled"] = "cli_config_file_enabled";
    Feature["DisableKotlinAnalysisEnabled"] = "disable_kotlin_analysis_enabled";
    Feature["MlPoweredQueriesEnabled"] = "ml_powered_queries_enabled";
    Feature["TrapCachingEnabled"] = "trap_caching_enabled";
    Feature["UploadFailedSarifEnabled"] = "upload_failed_sarif_enabled";
})(Feature = exports.Feature || (exports.Feature = {}));
exports.featureConfig = {
    [Feature.BypassToolcacheEnabled]: {
        envVar: "CODEQL_BYPASS_TOOLCACHE",
        // Cannot specify a minimum version because this flag is checked before we have
        // access to the CodeQL instance.
        minimumVersion: undefined,
    },
    [Feature.BypassToolcacheKotlinSwiftEnabled]: {
        envVar: "CODEQL_BYPASS_TOOLCACHE_KOTLIN_SWIFT",
        // Cannot specify a minimum version because this flag is checked before we have
        // access to the CodeQL instance.
        minimumVersion: undefined,
    },
    [Feature.DisableKotlinAnalysisEnabled]: {
        envVar: "CODEQL_DISABLE_KOTLIN_ANALYSIS",
        minimumVersion: undefined,
    },
    [Feature.CliConfigFileEnabled]: {
        envVar: "CODEQL_PASS_CONFIG_TO_CLI",
        minimumVersion: "2.11.6",
    },
    [Feature.MlPoweredQueriesEnabled]: {
        envVar: "CODEQL_ML_POWERED_QUERIES",
        minimumVersion: "2.7.5",
    },
    [Feature.TrapCachingEnabled]: {
        envVar: "CODEQL_TRAP_CACHING",
        minimumVersion: undefined,
    },
    [Feature.UploadFailedSarifEnabled]: {
        envVar: "CODEQL_ACTION_UPLOAD_FAILED_SARIF",
        minimumVersion: "2.11.3",
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
        // Bypassing the toolcache is disabled in test mode.
        if (feature === Feature.BypassToolcacheEnabled && util.isInTestMode()) {
            return false;
        }
        const envVar = (process.env[exports.featureConfig[feature].envVar] || "").toLocaleLowerCase();
        // Do not use this feature if user explicitly disables it via an environment variable.
        if (envVar === "false") {
            return false;
        }
        // Never use this feature if the CLI version explicitly can't support it.
        const minimumVersion = exports.featureConfig[feature].minimumVersion;
        if (codeql && minimumVersion) {
            if (!(await util.codeQlVersionAbove(codeql, minimumVersion))) {
                return false;
            }
        }
        // Use this feature if user explicitly enables it via an environment variable.
        if (envVar === "true") {
            return true;
        }
        // Ask the GitHub API if the feature is enabled.
        return await this.gitHubFeatureFlags.getValue(feature);
    }
}
exports.Features = Features;
class GitHubFeatureFlags {
    constructor(gitHubVersion, repositoryNwo, featureFlagsFile, logger) {
        this.gitHubVersion = gitHubVersion;
        this.repositoryNwo = repositoryNwo;
        this.featureFlagsFile = featureFlagsFile;
        this.logger = logger;
        /**/
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
            return {
                cliVersion: await this.getDefaultDotcomCliVersion(),
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
            this.logger.debug("Feature flags do not specify a default CLI version. Falling back to CLI version " +
                `${MINIMUM_ENABLED_CODEQL_VERSION}.`);
            return MINIMUM_ENABLED_CODEQL_VERSION;
        }
        const maxCliVersion = enabledFeatureFlagCliVersions.reduce((maxVersion, currentVersion) => currentVersion > maxVersion ? currentVersion : maxVersion, enabledFeatureFlagCliVersions[0]);
        this.logger.debug(`Derived default CLI version of ${maxCliVersion} from feature flags.`);
        return maxCliVersion;
    }
    async getValue(feature) {
        const response = await this.getAllFeatures();
        if (response === undefined) {
            this.logger.debug(`No feature flags API response for ${feature}, considering it disabled.`);
            return false;
        }
        const featureEnablement = response[feature];
        if (featureEnablement === undefined) {
            this.logger.debug(`Feature '${feature}' undefined in API response, considering it disabled.`);
            return false;
        }
        return !!featureEnablement;
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
            return remoteFlags;
        }
        catch (e) {
            if (util.isHTTPError(e) && e.status === 403) {
                this.logger.warning("This run of the CodeQL Action does not have permission to access Code Scanning API endpoints. " +
                    "As a result, it will not be opted into any experimental features. " +
                    "This could be because the Action is running on a pull request from a fork. If not, " +
                    `please ensure the Action has the 'security-events: write' permission. Details: ${e}`);
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