import * as fs from "fs";
import * as path from "path";

import * as semver from "semver";

import { getApiClient } from "./api-client";
import type { CodeQL } from "./codeql";
import * as defaults from "./defaults.json";
import { Logger } from "./logging";
import { CODEQL_OVERLAY_MINIMUM_VERSION } from "./overlay-database-utils";
import { RepositoryNwo } from "./repository";
import { ToolsFeature } from "./tools-features";
import * as util from "./util";

const DEFAULT_VERSION_FEATURE_FLAG_PREFIX = "default_codeql_version_";
const DEFAULT_VERSION_FEATURE_FLAG_SUFFIX = "_enabled";

/**
 * The first version of the CodeQL Bundle that shipped with zstd-compressed bundles.
 */
export const CODEQL_VERSION_ZSTD_BUNDLE = "2.19.0";

export interface CodeQLDefaultVersionInfo {
  cliVersion: string;
  tagName: string;
  toolsFeatureFlagsValid?: boolean;
}

export interface FeatureEnablement {
  /** Gets the default version of the CodeQL tools. */
  getDefaultCliVersion(
    variant: util.GitHubVariant,
  ): Promise<CodeQLDefaultVersionInfo>;
  getValue(feature: Feature, codeql?: CodeQL): Promise<boolean>;
}

/**
 * Feature enablement as returned by the GitHub API endpoint.
 *
 * Do not include the `codeql_action_` prefix as this is stripped by the API
 * endpoint.
 *
 * Legacy features should end with `_enabled`.
 */
export enum Feature {
  AllowToolcacheInput = "allow_toolcache_input",
  CleanupTrapCaches = "cleanup_trap_caches",
  CppDependencyInstallation = "cpp_dependency_installation_enabled",
  DiffInformedQueries = "diff_informed_queries",
  DisableCsharpBuildless = "disable_csharp_buildless",
  DisableJavaBuildlessEnabled = "disable_java_buildless_enabled",
  DisableKotlinAnalysisEnabled = "disable_kotlin_analysis_enabled",
  ExportDiagnosticsEnabled = "export_diagnostics_enabled",
  JavaMinimizeDependencyJars = "java_minimize_dependency_jars",
  OverlayAnalysis = "overlay_analysis",
  OverlayAnalysisActions = "overlay_analysis_actions",
  OverlayAnalysisCodeScanningActions = "overlay_analysis_code_scanning_actions",
  OverlayAnalysisCodeScanningCpp = "overlay_analysis_code_scanning_cpp",
  OverlayAnalysisCodeScanningCsharp = "overlay_analysis_code_scanning_csharp",
  OverlayAnalysisCodeScanningGo = "overlay_analysis_code_scanning_go",
  OverlayAnalysisCodeScanningJava = "overlay_analysis_code_scanning_java",
  OverlayAnalysisCodeScanningJavascript = "overlay_analysis_code_scanning_javascript",
  OverlayAnalysisCodeScanningPython = "overlay_analysis_code_scanning_python",
  OverlayAnalysisCodeScanningRuby = "overlay_analysis_code_scanning_ruby",
  OverlayAnalysisCodeScanningRust = "overlay_analysis_code_scanning_rust",
  OverlayAnalysisCodeScanningSwift = "overlay_analysis_code_scanning_swift",
  OverlayAnalysisCpp = "overlay_analysis_cpp",
  OverlayAnalysisCsharp = "overlay_analysis_csharp",
  OverlayAnalysisGo = "overlay_analysis_go",
  OverlayAnalysisJava = "overlay_analysis_java",
  OverlayAnalysisJavascript = "overlay_analysis_javascript",
  OverlayAnalysisPython = "overlay_analysis_python",
  OverlayAnalysisRuby = "overlay_analysis_ruby",
  OverlayAnalysisRust = "overlay_analysis_rust",
  OverlayAnalysisSwift = "overlay_analysis_swift",
  PythonDefaultIsToNotExtractStdlib = "python_default_is_to_not_extract_stdlib",
  QaTelemetryEnabled = "qa_telemetry_enabled",
  ResolveSupportedLanguagesUsingCli = "resolve_supported_languages_using_cli",
  UseRepositoryProperties = "use_repository_properties",
  ValidateDbConfig = "validate_db_config",
}

export const featureConfig: Record<
  Feature,
  {
    /**
     * Default value in environments where the feature flags API is not available,
     * such as GitHub Enterprise Server.
     */
    defaultValue: boolean;
    /**
     * Environment variable for explicitly enabling or disabling the feature.
     *
     * This overrides enablement status from the feature flags API.
     */
    envVar: string;
    /**
     * Whether the feature flag is part of the legacy feature flags API (defaults to false).
     *
     * These feature flags are included by default in the API response and do not need to be
     * explicitly requested.
     */
    legacyApi?: boolean;
    /**
     * Minimum version of the CLI, if applicable.
     *
     * Prefer using `ToolsFeature`s for future flags.
     */
    minimumVersion: string | undefined;
    /** Required tools feature, if applicable. */
    toolsFeature?: ToolsFeature;
  }
> = {
  [Feature.AllowToolcacheInput]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_ALLOW_TOOLCACHE_INPUT",
    minimumVersion: undefined,
  },
  [Feature.CleanupTrapCaches]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_CLEANUP_TRAP_CACHES",
    minimumVersion: undefined,
  },
  [Feature.CppDependencyInstallation]: {
    defaultValue: false,
    envVar: "CODEQL_EXTRACTOR_CPP_AUTOINSTALL_DEPENDENCIES",
    legacyApi: true,
    minimumVersion: "2.15.0",
  },
  [Feature.DiffInformedQueries]: {
    defaultValue: true,
    envVar: "CODEQL_ACTION_DIFF_INFORMED_QUERIES",
    minimumVersion: "2.21.0",
  },
  [Feature.DisableCsharpBuildless]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_DISABLE_CSHARP_BUILDLESS",
    minimumVersion: undefined,
  },
  [Feature.DisableJavaBuildlessEnabled]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_DISABLE_JAVA_BUILDLESS",
    legacyApi: true,
    minimumVersion: undefined,
  },
  [Feature.DisableKotlinAnalysisEnabled]: {
    defaultValue: false,
    envVar: "CODEQL_DISABLE_KOTLIN_ANALYSIS",
    legacyApi: true,
    minimumVersion: undefined,
  },
  [Feature.ExportDiagnosticsEnabled]: {
    defaultValue: true,
    envVar: "CODEQL_ACTION_EXPORT_DIAGNOSTICS",
    legacyApi: true,
    minimumVersion: undefined,
  },
  [Feature.ResolveSupportedLanguagesUsingCli]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_RESOLVE_SUPPORTED_LANGUAGES_USING_CLI",
    minimumVersion: undefined,
    toolsFeature: ToolsFeature.BuiltinExtractorsSpecifyDefaultQueries,
  },
  [Feature.OverlayAnalysis]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS",
    minimumVersion: CODEQL_OVERLAY_MINIMUM_VERSION,
  },
  [Feature.OverlayAnalysisActions]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_ACTIONS",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningActions]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_ACTIONS",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningCpp]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_CPP",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningCsharp]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_CSHARP",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningGo]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_GO",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningJava]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_JAVA",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningJavascript]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_JAVASCRIPT",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningPython]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_PYTHON",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningRuby]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_RUBY",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningRust]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_RUST",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCodeScanningSwift]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CODE_SCANNING_SWIFT",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCpp]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CPP",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisCsharp]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_CSHARP",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisGo]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_GO",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisJava]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_JAVA",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisJavascript]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_JAVASCRIPT",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisPython]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_PYTHON",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisRuby]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_RUBY",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisRust]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_RUST",
    minimumVersion: undefined,
  },
  [Feature.OverlayAnalysisSwift]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_OVERLAY_ANALYSIS_SWIFT",
    minimumVersion: undefined,
  },
  [Feature.PythonDefaultIsToNotExtractStdlib]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_DISABLE_PYTHON_STANDARD_LIBRARY_EXTRACTION",
    minimumVersion: undefined,
    toolsFeature: ToolsFeature.PythonDefaultIsToNotExtractStdlib,
  },
  [Feature.UseRepositoryProperties]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_USE_REPOSITORY_PROPERTIES",
    minimumVersion: undefined,
  },
  [Feature.QaTelemetryEnabled]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_QA_TELEMETRY",
    legacyApi: true,
    minimumVersion: undefined,
  },
  [Feature.JavaMinimizeDependencyJars]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_JAVA_MINIMIZE_DEPENDENCY_JARS",
    minimumVersion: "2.23.0",
  },
  [Feature.ValidateDbConfig]: {
    defaultValue: false,
    envVar: "CODEQL_ACTION_VALIDATE_DB_CONFIG",
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

export const FEATURE_FLAGS_FILE_NAME = "cached-feature-flags.json";

/**
 * Determines the enablement status of a number of features.
 * If feature enablement is not able to be determined locally, a request to the
 * GitHub API is made to determine the enablement status.
 */
export class Features implements FeatureEnablement {
  private gitHubFeatureFlags: GitHubFeatureFlags;

  constructor(
    gitHubVersion: util.GitHubVersion,
    repositoryNwo: RepositoryNwo,
    tempDir: string,
    private readonly logger: Logger,
  ) {
    this.gitHubFeatureFlags = new GitHubFeatureFlags(
      gitHubVersion,
      repositoryNwo,
      path.join(tempDir, FEATURE_FLAGS_FILE_NAME),
      logger,
    );
  }

  async getDefaultCliVersion(
    variant: util.GitHubVariant,
  ): Promise<CodeQLDefaultVersionInfo> {
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
  async getValue(feature: Feature, codeql?: CodeQL): Promise<boolean> {
    if (!codeql && featureConfig[feature].minimumVersion) {
      throw new Error(
        `Internal error: A minimum version is specified for feature ${feature}, but no instance of CodeQL was provided.`,
      );
    }
    if (!codeql && featureConfig[feature].toolsFeature) {
      throw new Error(
        `Internal error: A required tools feature is specified for feature ${feature}, but no instance of CodeQL was provided.`,
      );
    }

    const envVar = (
      process.env[featureConfig[feature].envVar] || ""
    ).toLocaleLowerCase();

    // Do not use this feature if user explicitly disables it via an environment variable.
    if (envVar === "false") {
      this.logger.debug(
        `Feature ${feature} is disabled via the environment variable ${featureConfig[feature].envVar}.`,
      );
      return false;
    }

    // Never use this feature if the CLI version explicitly can't support it.
    const minimumVersion = featureConfig[feature].minimumVersion;
    if (codeql && minimumVersion) {
      if (!(await util.codeQlVersionAtLeast(codeql, minimumVersion))) {
        this.logger.debug(
          `Feature ${feature} is disabled because the CodeQL CLI version is older than the minimum ` +
            `version ${minimumVersion}.`,
        );
        return false;
      } else {
        this.logger.debug(
          `CodeQL CLI version ${
            (await codeql.getVersion()).version
          } is newer than the minimum ` +
            `version ${minimumVersion} for feature ${feature}.`,
        );
      }
    }
    const toolsFeature = featureConfig[feature].toolsFeature;
    if (codeql && toolsFeature) {
      if (!(await codeql.supportsFeature(toolsFeature))) {
        this.logger.debug(
          `Feature ${feature} is disabled because the CodeQL CLI version does not support the ` +
            `required tools feature ${toolsFeature}.`,
        );
        return false;
      } else {
        this.logger.debug(
          `CodeQL CLI version ${
            (await codeql.getVersion()).version
          } supports the required tools feature ${toolsFeature} for feature ${feature}.`,
        );
      }
    }

    // Use this feature if user explicitly enables it via an environment variable.
    if (envVar === "true") {
      this.logger.debug(
        `Feature ${feature} is enabled via the environment variable ${featureConfig[feature].envVar}.`,
      );
      return true;
    }

    // Ask the GitHub API if the feature is enabled.
    const apiValue = await this.gitHubFeatureFlags.getValue(feature);
    if (apiValue !== undefined) {
      this.logger.debug(
        `Feature ${feature} is ${
          apiValue ? "enabled" : "disabled"
        } via the GitHub API.`,
      );
      return apiValue;
    }

    const defaultValue = featureConfig[feature].defaultValue;
    this.logger.debug(
      `Feature ${feature} is ${
        defaultValue ? "enabled" : "disabled"
      } due to its default value.`,
    );
    return defaultValue;
  }
}

class GitHubFeatureFlags {
  private cachedApiResponse: GitHubFeatureFlagsApiResponse | undefined;

  // We cache whether the feature flags were accessed or not in order to accurately report whether flags were
  // incorrectly configured vs. inaccessible in our telemetry.
  private hasAccessedRemoteFeatureFlags: boolean;

  constructor(
    private readonly gitHubVersion: util.GitHubVersion,
    private readonly repositoryNwo: RepositoryNwo,
    private readonly featureFlagsFile: string,
    private readonly logger: Logger,
  ) {
    this.hasAccessedRemoteFeatureFlags = false; // Not accessed by default.
  }

  private getCliVersionFromFeatureFlag(f: string): string | undefined {
    if (
      !f.startsWith(DEFAULT_VERSION_FEATURE_FLAG_PREFIX) ||
      !f.endsWith(DEFAULT_VERSION_FEATURE_FLAG_SUFFIX)
    ) {
      return undefined;
    }
    const version = f
      .substring(
        DEFAULT_VERSION_FEATURE_FLAG_PREFIX.length,
        f.length - DEFAULT_VERSION_FEATURE_FLAG_SUFFIX.length,
      )
      .replace(/_/g, ".");

    if (!semver.valid(version)) {
      this.logger.warning(
        `Ignoring feature flag ${f} as it does not specify a valid CodeQL version.`,
      );
      return undefined;
    }
    return version;
  }

  async getDefaultCliVersion(
    variant: util.GitHubVariant,
  ): Promise<CodeQLDefaultVersionInfo> {
    if (variant === util.GitHubVariant.DOTCOM) {
      return await this.getDefaultDotcomCliVersion();
    }
    return {
      cliVersion: defaults.cliVersion,
      tagName: defaults.bundleVersion,
    };
  }

  async getDefaultDotcomCliVersion(): Promise<CodeQLDefaultVersionInfo> {
    const response = await this.getAllFeatures();

    const enabledFeatureFlagCliVersions = Object.entries(response)
      .map(([f, isEnabled]) =>
        isEnabled ? this.getCliVersionFromFeatureFlag(f) : undefined,
      )
      .filter((f): f is string => f !== undefined);

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
      this.logger.warning(
        "Feature flags do not specify a default CLI version. Falling back to the CLI version " +
          `shipped with the Action. This is ${defaults.cliVersion}.`,
      );
      const result: CodeQLDefaultVersionInfo = {
        cliVersion: defaults.cliVersion,
        tagName: defaults.bundleVersion,
      };
      if (this.hasAccessedRemoteFeatureFlags) {
        result.toolsFeatureFlagsValid = false;
      }
      return result;
    }

    const maxCliVersion = enabledFeatureFlagCliVersions.reduce(
      (maxVersion, currentVersion) =>
        currentVersion > maxVersion ? currentVersion : maxVersion,
      enabledFeatureFlagCliVersions[0],
    );
    this.logger.debug(
      `Derived default CLI version of ${maxCliVersion} from feature flags.`,
    );
    return {
      cliVersion: maxCliVersion,
      tagName: `codeql-bundle-v${maxCliVersion}`,
      toolsFeatureFlagsValid: true,
    };
  }

  async getValue(feature: Feature): Promise<boolean | undefined> {
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

  private async getAllFeatures(): Promise<GitHubFeatureFlagsApiResponse> {
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

  private async readLocalFlags(): Promise<
    GitHubFeatureFlagsApiResponse | undefined
  > {
    try {
      if (fs.existsSync(this.featureFlagsFile)) {
        this.logger.debug(
          `Loading feature flags from ${this.featureFlagsFile}`,
        );
        return JSON.parse(
          fs.readFileSync(this.featureFlagsFile, "utf8"),
        ) as GitHubFeatureFlagsApiResponse;
      }
    } catch (e) {
      this.logger.warning(
        `Error reading cached feature flags file ${this.featureFlagsFile}: ${e}. Requesting from GitHub instead.`,
      );
    }
    return undefined;
  }

  private async writeLocalFlags(
    flags: GitHubFeatureFlagsApiResponse,
  ): Promise<void> {
    try {
      this.logger.debug(`Writing feature flags to ${this.featureFlagsFile}`);
      fs.writeFileSync(this.featureFlagsFile, JSON.stringify(flags));
    } catch (e) {
      this.logger.warning(
        `Error writing cached feature flags file ${this.featureFlagsFile}: ${e}.`,
      );
    }
  }

  private async loadApiResponse(): Promise<GitHubFeatureFlagsApiResponse> {
    // Do nothing when not running against github.com
    if (
      this.gitHubVersion.type !== util.GitHubVariant.DOTCOM &&
      this.gitHubVersion.type !== util.GitHubVariant.GHE_DOTCOM
    ) {
      this.logger.debug(
        "Not running against github.com. Disabling all toggleable features.",
      );
      this.hasAccessedRemoteFeatureFlags = false;
      return {};
    }
    try {
      const featuresToRequest = Object.entries(featureConfig)
        .filter(([, config]) => !config.legacyApi)
        .map(([f]) => f);

      const FEATURES_PER_REQUEST = 25;
      const featureChunks: string[][] = [];
      while (featuresToRequest.length > 0) {
        featureChunks.push(featuresToRequest.splice(0, FEATURES_PER_REQUEST));
      }

      let remoteFlags: GitHubFeatureFlagsApiResponse = {};

      for (const chunk of featureChunks) {
        const response = await getApiClient().request(
          "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
          {
            owner: this.repositoryNwo.owner,
            repo: this.repositoryNwo.repo,
            features: chunk.join(","),
          },
        );
        const chunkFlags = response.data as GitHubFeatureFlagsApiResponse;
        remoteFlags = { ...remoteFlags, ...chunkFlags };
      }

      this.logger.debug(
        "Loaded the following default values for the feature flags from the Code Scanning API:",
      );
      for (const [feature, value] of Object.entries(remoteFlags).sort(
        ([nameA], [nameB]) => nameA.localeCompare(nameB),
      )) {
        this.logger.debug(`  ${feature}: ${value}`);
      }
      this.hasAccessedRemoteFeatureFlags = true;
      return remoteFlags;
    } catch (e) {
      const httpError = util.asHTTPError(e);
      if (httpError?.status === 403) {
        this.logger.warning(
          "This run of the CodeQL Action does not have permission to access Code Scanning API endpoints. " +
            "As a result, it will not be opted into any experimental features. " +
            "This could be because the Action is running on a pull request from a fork. If not, " +
            `please ensure the Action has the 'security-events: write' permission. Details: ${httpError.message}`,
        );
        this.hasAccessedRemoteFeatureFlags = false;
        return {};
      } else {
        // Some features, such as `ml_powered_queries_enabled` affect the produced alerts.
        // Considering these features disabled in the event of a transient error could
        // therefore lead to alert churn. As a result, we crash if we cannot determine the value of
        // the feature.
        throw new Error(
          `Encountered an error while trying to determine feature enablement: ${e}`,
        );
      }
    }
  }
}
