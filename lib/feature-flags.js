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
exports.createFeatureFlags = exports.GitHubFeatureFlags = exports.FeatureFlag = void 0;
const api_client_1 = require("./api-client");
const util = __importStar(require("./util"));
var FeatureFlag;
(function (FeatureFlag) {
    FeatureFlag["DatabaseUploadsEnabled"] = "database_uploads_enabled";
    FeatureFlag["MlPoweredQueriesEnabled"] = "ml_powered_queries_enabled";
})(FeatureFlag = exports.FeatureFlag || (exports.FeatureFlag = {}));
class GitHubFeatureFlags {
    constructor(gitHubVersion, apiDetails, repositoryNwo, logger) {
        this.gitHubVersion = gitHubVersion;
        this.apiDetails = apiDetails;
        this.repositoryNwo = repositoryNwo;
        this.logger = logger;
    }
    async getValue(flag) {
        const response = (await this.getApiResponse())[flag];
        if (response === undefined) {
            this.logger.debug(`Feature flag '${flag}' undefined in API response, considering it disabled.`);
            return false;
        }
        return response;
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