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
exports.createFeatureFlags = exports.GitHubFeatureFlags = void 0;
const api_client_1 = require("./api-client");
const repository_1 = require("./repository");
const util = __importStar(require("./util"));
class GitHubFeatureFlags {
    constructor(gitHubVersion, apiDetails, logger) {
        this.gitHubVersion = gitHubVersion;
        this.apiDetails = apiDetails;
        this.logger = logger;
    }
    getDatabaseUploadsEnabled() {
        return this.getFeatureFlag("database_uploads_enabled");
    }
    getMlPoweredQueriesEnabled() {
        return this.getFeatureFlag("ml_powered_queries_enabled");
    }
    getUploadsDomainEnabled() {
        return this.getFeatureFlag("uploads_domain_enabled");
    }
    async preloadFeatureFlags() {
        await this.getApiResponse();
    }
    async getFeatureFlag(name) {
        const response = (await this.getApiResponse())[name];
        if (response === undefined) {
            this.logger.debug(`Feature flag '${name}' undefined in API response, considering it disabled.`);
        }
        return response || false;
    }
    async getApiResponse() {
        const loadApiResponse = async () => {
            // Do nothing when not running against github.com
            if (this.gitHubVersion.type !== util.GitHubVariant.DOTCOM) {
                this.logger.debug("Not running against github.com. Disabling all feature flags.");
                return {};
            }
            const client = (0, api_client_1.getApiClient)(this.apiDetails);
            const repositoryNwo = (0, repository_1.parseRepositoryNwo)(util.getRequiredEnvParam("GITHUB_REPOSITORY"));
            try {
                const response = await client.request("GET /repos/:owner/:repo/code-scanning/codeql-action/features", {
                    owner: repositoryNwo.owner,
                    repo: repositoryNwo.repo,
                });
                return response.data;
            }
            catch (e) {
                console.log(e);
                this.logger.info(`Disabling all feature flags due to unknown error: ${e}`);
                return {};
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
        getDatabaseUploadsEnabled: async () => {
            return enabledFlags.includes("database_uploads_enabled");
        },
        getMlPoweredQueriesEnabled: async () => {
            return enabledFlags.includes("ml_powered_queries_enabled");
        },
        getUploadsDomainEnabled: async () => {
            return enabledFlags.includes("uploads_domain_enabled");
        },
    };
}
exports.createFeatureFlags = createFeatureFlags;
//# sourceMappingURL=feature-flags.js.map