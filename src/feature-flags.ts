import { getApiClient, GitHubApiDetails } from "./api-client";
import { Logger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as util from "./util";

export interface FeatureFlags {
  getDatabaseUploadsEnabled(): Promise<boolean>;
  getMlPoweredQueriesEnabled(): Promise<boolean>;
  getUploadsDomainEnabled(): Promise<boolean>;
}

/**
 * A response from the GitHub API that contains feature flag enablement information for the CodeQL
 * Action.
 *
 * It maps feature flags to whether they are enabled or not.
 */
type FeatureFlagsApiResponse = { [flagName: string]: boolean };

export class GitHubFeatureFlags implements FeatureFlags {
  private cachedApiResponse: FeatureFlagsApiResponse | undefined;

  constructor(
    private gitHubVersion: util.GitHubVersion,
    private apiDetails: GitHubApiDetails,
    private logger: Logger
  ) {}

  getDatabaseUploadsEnabled(): Promise<boolean> {
    return this.getFeatureFlag("database_uploads_enabled");
  }

  getMlPoweredQueriesEnabled(): Promise<boolean> {
    return this.getFeatureFlag("ml_powered_queries_enabled");
  }

  getUploadsDomainEnabled(): Promise<boolean> {
    return this.getFeatureFlag("uploads_domain_enabled");
  }

  async preloadFeatureFlags(): Promise<void> {
    await this.getApiResponse();
  }

  private async getFeatureFlag(name: string): Promise<boolean> {
    const response = (await this.getApiResponse())[name];
    if (response === undefined) {
      this.logger.debug(
        `Feature flag '${name}' undefined in API response, considering it disabled.`
      );
    }
    return response || false;
  }

  private async getApiResponse(): Promise<FeatureFlagsApiResponse> {
    const loadApiResponse = async () => {
      // Do nothing when not running against github.com
      if (this.gitHubVersion.type !== util.GitHubVariant.DOTCOM) {
        this.logger.debug(
          "Not running against github.com. Disabling all feature flags."
        );
        return {};
      }
      const client = getApiClient(this.apiDetails);
      const repositoryNwo = parseRepositoryNwo(
        util.getRequiredEnvParam("GITHUB_REPOSITORY")
      );
      try {
        const response = await client.request(
          "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
          {
            owner: repositoryNwo.owner,
            repo: repositoryNwo.repo,
          }
        );
        return response.data;
      } catch (e) {
        // Some feature flags, such as `ml_powered_queries_enabled` affect the produced alerts.
        // Considering these feature flags disabled in the event of a transient error could
        // therefore lead to alert churn. As a result, we crash if we cannot determine the value of
        // the feature flags.
        throw new Error(
          `Encountered an error while trying to load feature flags: ${e}`
        );
      }
    };

    const apiResponse = this.cachedApiResponse || (await loadApiResponse());
    this.cachedApiResponse = apiResponse;
    return apiResponse;
  }
}

type FeatureFlagName =
  | "database_uploads_enabled"
  | "ml_powered_queries_enabled"
  | "uploads_domain_enabled";

/**
 * Create a feature flags instance with the specified set of enabled flags.
 *
 * This should be only used within tests.
 */
export function createFeatureFlags(
  enabledFlags: FeatureFlagName[]
): FeatureFlags {
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
