import { getApiClient, GitHubApiDetails } from "./api-client";
import { CodeQL } from "./codeql";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import * as util from "./util";

export interface FeatureEnablement {
  getValue(feature: Feature, codeql?: CodeQL): Promise<boolean>;
}

export enum Feature {
  BypassToolcacheEnabled = "bypass_toolcache_enabled",
  CliConfigFileEnabled = "cli_config_file_enabled",
  GolangExtractionReconciliationEnabled = "golang_extraction_reconciliation_enabled",
  MlPoweredQueriesEnabled = "ml_powered_queries_enabled",
  TrapCachingEnabled = "trap_caching_enabled",
}

export const featureConfig: Record<
  Feature,
  { envVar: string; minimumVersion: string | undefined }
> = {
  [Feature.BypassToolcacheEnabled]: {
    envVar: "CODEQL_BYPASS_TOOLCACHE",
    minimumVersion: undefined,
  },
  [Feature.CliConfigFileEnabled]: {
    envVar: "CODEQL_PASS_CONFIG_TO_CLI",
    minimumVersion: "2.10.1",
  },
  [Feature.GolangExtractionReconciliationEnabled]: {
    envVar: "CODEQL_GOLANG_EXTRACTION_RECONCILIATION",
    minimumVersion: undefined,
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
 * A response from the GitHub API that contains feature flag enablement information for the CodeQL
 * Action.
 *
 * It maps feature flags to whether they are enabled or not.
 */
type GitHubFeatureFlagsApiResponse = Partial<Record<Feature, boolean>>;

/**
 * Determines the enablement status of a number of features.
 * If feature enablement is not able to be determined locally, a request to the
 * github API is made to determine the enablement status.
 */
export class Features implements FeatureEnablement {
  private gitHubFeatureFlags: GitHubFeatureFlags;

  constructor(
    gitHubVersion: util.GitHubVersion,
    apiDetails: GitHubApiDetails,
    repositoryNwo: RepositoryNwo,
    logger: Logger
  ) {
    this.gitHubFeatureFlags = new GitHubFeatureFlags(
      gitHubVersion,
      apiDetails,
      repositoryNwo,
      logger
    );
  }

  /**
   *
   * @param feature The feature flag to check.
   * @param codeql An optional CodeQL object. If provided, and a `minimumVersion` is specified for the
   *        feature flag, the version of the CodeQL CLI will be checked against the minimum version.
   *        If the version is less than the minimum version, the feature flag will be considered
   *        disabled. If not provided, and a `minimumVersion` is specified for the feature flag, the
   *        this function will throw.
   * @returns true if the feature flag is enabled, false otherwise.
   *
   * @throws if a `minimumVersion` is specified for the feature flag, and `codeql` is not provided.
   */
  async getValue(feature: Feature, codeql?: CodeQL): Promise<boolean> {
    if (!codeql && featureConfig[feature].minimumVersion) {
      throw new Error(
        `Internal error: A minimum version is specified for feature ${feature}, but no instance of CodeQL was provided.`
      );
    }

    // Bypassing the toolcache is disabled in test mode.
    if (feature === Feature.BypassToolcacheEnabled && util.isInTestMode()) {
      return false;
    }

    const envVar = (
      process.env[featureConfig[feature].envVar] || ""
    ).toLocaleLowerCase();

    // Do not use this feature if user explicitly disables it via an environment variable.
    if (envVar === "false") {
      return false;
    }

    // Never use this feature if the CLI version explicitly can't support it.
    const minimumVersion = featureConfig[feature].minimumVersion;
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

class GitHubFeatureFlags implements FeatureEnablement {
  private cachedApiResponse: GitHubFeatureFlagsApiResponse | undefined;

  constructor(
    private gitHubVersion: util.GitHubVersion,
    private apiDetails: GitHubApiDetails,
    private repositoryNwo: RepositoryNwo,
    private logger: Logger
  ) {
    /**/
  }

  async getValue(feature: Feature): Promise<boolean> {
    const response = await this.getApiResponse();
    if (response === undefined) {
      this.logger.debug(
        `No feature flags API response for ${feature}, considering it disabled.`
      );
      return false;
    }
    const featureEnablement = response[feature];
    if (featureEnablement === undefined) {
      this.logger.debug(
        `Feature '${feature}' undefined in API response, considering it disabled.`
      );
      return false;
    }
    return !!featureEnablement;
  }

  private async getApiResponse(): Promise<GitHubFeatureFlagsApiResponse> {
    const apiResponse =
      this.cachedApiResponse || (await this.loadApiResponse());
    this.cachedApiResponse = apiResponse;
    return apiResponse;
  }

  private async loadApiResponse() {
    // Do nothing when not running against github.com
    if (this.gitHubVersion.type !== util.GitHubVariant.DOTCOM) {
      this.logger.debug(
        "Not running against github.com. Disabling all toggleable features."
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
        // Some features, such as `ml_powered_queries_enabled` affect the produced alerts.
        // Considering these features disabled in the event of a transient error could
        // therefore lead to alert churn. As a result, we crash if we cannot determine the value of
        // the feature.
        throw new Error(
          `Encountered an error while trying to determine feature enablement: ${e}`
        );
      }
    }
  }
}
