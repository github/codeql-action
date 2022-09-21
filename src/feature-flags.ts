import { getApiClient, GitHubApiDetails } from "./api-client";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import * as util from "./util";

export interface FeatureFlags {
  getValue(flag: FeatureFlag): Promise<boolean>;
}

export enum FeatureFlag {
  BypassToolcacheEnabled = "bypass_toolcache_enabled",
  MlPoweredQueriesEnabled = "ml_powered_queries_enabled",
  TrapCachingEnabled = "trap_caching_enabled",
  GolangExtractionReconciliationEnabled = "golang_extraction_reconciliation_enabled",
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
    // Always return true for purposes of investigation in this PR.
    return true;

    // // Bypassing the toolcache is disabled in test mode.
    // if (flag === FeatureFlag.BypassToolcacheEnabled && util.isInTestMode()) {
    //   return false;
    // }

    // const response = await this.getApiResponse();
    // if (response === undefined) {
    //   this.logger.debug(
    //     `No feature flags API response for ${flag}, considering it disabled.`
    //   );
    //   return false;
    // }
    // const flagValue = response[flag];
    // if (flagValue === undefined) {
    //   this.logger.debug(
    //     `Feature flag '${flag}' undefined in API response, considering it disabled.`
    //   );
    //   return false;
    // }
    // return flagValue;
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
        if (util.isHTTPError(e) && e.status === 403) {
          this.logger.warning(
            "This run of the CodeQL Action does not have permission to access Code Scanning API endpoints. " +
              "As a result, it will not be opted into any experimental features. " +
              "This could be because the Action is running on a pull request from a fork. If not, " +
              `please ensure the Action has the 'security-events: write' permission. Details: ${e}`
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
