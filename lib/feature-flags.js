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
exports.Features = exports.featureConfig = exports.Feature = void 0;
const api_client_1 = require("./api-client");
const util = __importStar(require("./util"));
var Feature;
(function (Feature) {
    Feature["BypassToolcacheEnabled"] = "bypass_toolcache_enabled";
    Feature["CliConfigFileEnabled"] = "cli_config_file_enabled";
    Feature["FileBaselineInformationEnabled"] = "file_baseline_information_enabled";
    Feature["MlPoweredQueriesEnabled"] = "ml_powered_queries_enabled";
    Feature["TrapCachingEnabled"] = "trap_caching_enabled";
})(Feature = exports.Feature || (exports.Feature = {}));
exports.featureConfig = {
    [Feature.BypassToolcacheEnabled]: {
        envVar: "CODEQL_BYPASS_TOOLCACHE",
        minimumVersion: undefined,
    },
    [Feature.CliConfigFileEnabled]: {
        envVar: "CODEQL_PASS_CONFIG_TO_CLI",
        minimumVersion: "2.11.1",
    },
    [Feature.FileBaselineInformationEnabled]: {
        envVar: "CODEQL_FILE_BASELINE_INFORMATION",
        minimumVersion: "2.11.3",
    },
    [Feature.MlPoweredQueriesEnabled]: {
        envVar: "CODEQL_ML_POWERED_QUERIES",
        minimumVersion: "2.7.5",
    },
    [Feature.TrapCachingEnabled]: {
        envVar: "CODEQL_TRAP_CACHING",
        minimumVersion: undefined,
    },
};
/**
 * Determines the enablement status of a number of features.
 * If feature enablement is not able to be determined locally, a request to the
 * GitHub API is made to determine the enablement status.
 */
class Features {
    constructor(gitHubVersion, repositoryNwo, logger) {
        this.gitHubFeatureFlags = new GitHubFeatureFlags(gitHubVersion, repositoryNwo, logger);
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
    constructor(gitHubVersion, repositoryNwo, logger) {
        this.gitHubVersion = gitHubVersion;
        this.repositoryNwo = repositoryNwo;
        this.logger = logger;
        /**/
    }
    async getValue(feature) {
        const response = await this.getApiResponse();
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
    async getApiResponse() {
        const apiResponse = this.cachedApiResponse || (await this.loadApiResponse());
        this.cachedApiResponse = apiResponse;
        return apiResponse;
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
            return response.data;
        }
        catch (e) {
            if (util.isHTTPError(e) && e.status === 403) {
                this.logger.warning("This run of the CodeQL Action does not have permission to access Code Scanning API endpoints. " +
                    "As a result, it will not be opted into any experimental features. " +
                    "This could be because the Action is running on a pull request from a fork. If not, " +
                    `please ensure the Action has the 'security-events: write' permission. Details: ${e}`);
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