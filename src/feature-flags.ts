import { getApiClient, GitHubApiDetails } from "./api-client";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import * as util from "./util";

export interface FeatureFlags {
  getValue(flag: FeatureFlag): Promise<boolean>;
}

export enum FeatureFlag {
  DatabaseUploadsEnabled = "database_uploads_enabled",
  MlPoweredQueriesEnabled = "ml_powered_queries_enabled",
  UploadsDomainEnabled = "uploads_domain_enabled",
}

/**
 * A response from the GitHub API that contains feature flag enablement information for the CodeQL
 * Action.
 *
 * It maps feature flags to whether they are enabled or not.
 */
type FeatureFlagsApiResponse = Partial<Record<FeatureFlag, boolean>>;

export class GitHubFeatureFlags implements FeatureFlags {
  private cachedApiResponse: FeatureFlagsApiResponse | undefined;

  constructor(
    private gitHubVersion: util.GitHubVersion,
    private apiDetails: GitHubApiDetails,
    private repositoryNwo: RepositoryNwo,
    private logger: Logger
  ) {}

  async getValue(flag: FeatureFlag): Promise<boolean> {
    const response = (await this.getApiResponse())[flag];
    if (response === undefined) {
      this.logger.debug(
        `Feature flag '${flag}' undefined in API response, considering it disabled.`
      );
      return false;
    }
    return response;
  }

  async preloadFeatureFlags(): Promise<void> {
    await this.getApiResponse();
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
      try {
        const response = await client.request(
          "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
          {
            owner: this.repositoryNwo.owner,
            repo: this.repositoryNwo.repo,
          }
        );
        return response.data;
      } catch (e) {
        if (
          e instanceof Error &&
          e.message.includes("Resource not accessible by integration")
        ) {
          throw new Error(
            `Resource not accessible by integration. This usually means that your ` +
              `workflow is missing the required security-events write permissions. ` +
              `See https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions ` +
              `for more information.`
          );
        } else {
          // Some feature flags, such as `ml_powered_queries_enabled` affect the produced alerts.
          // Considering these feature flags disabled in the event of a transient error could
          // therefore lead to alert churn. As a result, we crash if we cannot determine the value of
          // the feature flags.
          throw new Error(
            `Encountered an error while trying to load feature flags: ${e}`
          );
        }
      }
    };

    const apiResponse = this.cachedApiResponse || (await loadApiResponse());
    this.cachedApiResponse = apiResponse;
    return apiResponse;
  }
}

/**
 * Create a feature flags instance with the specified set of enabled flags.
 *
 * This should be only used within tests.
 */
export function createFeatureFlags(enabledFlags: FeatureFlag[]): FeatureFlags {
  return {
    getValue: async (flag) => {
      return enabledFlags.includes(flag);
    },
  };
}
