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
exports.createFeatureFlags = exports.GitHubFeatureFlags = exports.featureFlagConfig = exports.FeatureFlag = void 0;
const api_client_1 = require("./api-client");
const util = __importStar(require("./util"));
var FeatureFlag;
(function (FeatureFlag) {
    FeatureFlag["BypassToolcacheEnabled"] = "bypass_toolcache_enabled";
    FeatureFlag["MlPoweredQueriesEnabled"] = "ml_powered_queries_enabled";
    FeatureFlag["TrapCachingEnabled"] = "trap_caching_enabled";
    FeatureFlag["GolangExtractionReconciliationEnabled"] = "golang_extraction_reconciliation_enabled";
    FeatureFlag["CliConfigFileEnabled"] = "cli_config_file_enabled";
})(FeatureFlag = exports.FeatureFlag || (exports.FeatureFlag = {}));
exports.featureFlagConfig = {
    [FeatureFlag.BypassToolcacheEnabled]: {
        envVar: "CODEQL_BYPASS_TOOLCACHE",
        minimumVersion: undefined,
    },
    [FeatureFlag.MlPoweredQueriesEnabled]: {
        envVar: "CODEQL_VERSION_ML_POWERED_QUERIES",
        minimumVersion: "2.7.5",
    },
    [FeatureFlag.TrapCachingEnabled]: {
        envVar: "CODEQL_TRAP_CACHING",
        minimumVersion: undefined,
    },
    [FeatureFlag.GolangExtractionReconciliationEnabled]: {
        envVar: "CODEQL_GOLANG_EXTRACTION_RECONCILIATION",
        minimumVersion: undefined,
    },
    [FeatureFlag.CliConfigFileEnabled]: {
        envVar: "CODEQL_PASS_CONFIG_TO_CLI",
        minimumVersion: "2.10.1",
    },
};
class GitHubFeatureFlags {
    constructor(gitHubVersion, apiDetails, repositoryNwo, logger) {
        this.gitHubVersion = gitHubVersion;
        this.apiDetails = apiDetails;
        this.repositoryNwo = repositoryNwo;
        this.logger = logger;
    }
    async getValue(flag, codeql) {
        // Bypassing the toolcache is disabled in test mode.
        if (flag === FeatureFlag.BypassToolcacheEnabled && util.isInTestMode()) {
            return false;
        }
        const envVar = (process.env[exports.featureFlagConfig[flag].envVar] || "").toLocaleLowerCase();
        // Do not use this feature if user explicitly disables it via an environment variable.
        if (envVar === "false") {
            return false;
        }
        // Never use this feature if the CLI version explicitly can't support it.
        const minimumVersion = exports.featureFlagConfig[flag].minimumVersion;
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
        const response = await this.getApiResponse();
        if (response === undefined) {
            this.logger.debug(`No feature flags API response for ${flag}, considering it disabled.`);
            return false;
        }
        const flagValue = response[flag];
        if (flagValue === undefined) {
            this.logger.debug(`Feature flag '${flag}' undefined in API response, considering it disabled.`);
            return false;
        }
        return flagValue;
    }
    async getApiResponse() {
        const loadApiResponse = async () => {
            // Do nothing when not running against github.com
            if (this.gitHubVersion.type !== util.GitHubVariant.DOTCOM) {
                this.logger.debug("Not running against github.com. Disabling all feature flags.");
                return {};
            }
            const client = (0, api_client_1.getApiClient)(this.apiDetails);
            try {
                const response = await client.request("GET /repos/:owner/:repo/code-scanning/codeql-action/features", {
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
                    // Some feature flags, such as `ml_powered_queries_enabled` affect the produced alerts.
                    // Considering these feature flags disabled in the event of a transient error could
                    // therefore lead to alert churn. As a result, we crash if we cannot determine the value of
                    // the feature flags.
                    throw new Error(`Encountered an error while trying to load feature flags: ${e}`);
                }
            }
        };
        const apiResponse = this.cachedApiResponse || (await loadApiResponse());
        this.cachedApiResponse = apiResponse;
        return apiResponse;
    }
}
exports.GitHubFeatureFlags = GitHubFeatureFlags;
/**
 * Create a feature flags instance with the specified set of enabled flags.
 *
 * This should be only used within tests.
 */
function createFeatureFlags(enabledFlags) {
    return {
        getValue: async (flag) => {
            return enabledFlags.includes(flag);
        },
    };
}
exports.createFeatureFlags = createFeatureFlags;
//# sourceMappingURL=feature-flags.js.map