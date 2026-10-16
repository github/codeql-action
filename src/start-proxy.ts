import * as path from "path";

import * as toolcache from "@actions/tool-cache";

import { ActionState } from "./action-common";
import {
  getGitHubVersion,
  InstanceApiClient,
  type GitHubApiDetails,
} from "./api-client";
import * as artifactScanner from "./artifact-scanner";
import * as defaults from "./defaults.json";
import {
  CodeQLDefaultVersionInfo,
  Feature,
  FeatureEnablement,
} from "./feature-flags";
import * as json from "./json";
import { BuiltInLanguage } from "./languages";
import { Logger } from "./logging";
import { BundlePlatform, getBundlePlatform } from "./platform";
import { getCodeQLAssetDownloadURL } from "./setup/repository";
import {
  StartProxyError,
  StartProxyErrorType,
} from "./start-proxy/status-report";
import {
  Address,
  Registry,
  Credential,
  hasToken,
  hasUsernameAndPassword,
  hasUsername,
  RawCredential,
} from "./start-proxy/types";
import { getAuthConfig } from "./start-proxy/validation";
import { ConfigurationError, getErrorMessage, isDefined } from "./util";

export * from "./start-proxy/types";
export * from "./start-proxy/status-report";

/** The basename of the proxy artifacts. */
export const UPDATEJOB_PROXY = "update-job-proxy";

function isPAT(value: string) {
  return artifactScanner.isAuthToken(value, [
    artifactScanner.GITHUB_PAT_CLASSIC_PATTERN,
    artifactScanner.GITHUB_PAT_FINE_GRAINED_PATTERN,
  ]);
}

/**
 * A list of always-enabled registry types. The registry types in this list are always
 * enabled, because generic CodeQL workflow components may use them rather than just
 * language-specific components.
 */
export const ALWAYS_ENABLED_REGISTRY_TYPE = [
  "git_source",
  "docker_registry",
] as const;

type RegistryMapping = Partial<Record<BuiltInLanguage, string[]>>;

export const LANGUAGE_TO_REGISTRY_TYPE: Required<RegistryMapping> = {
  actions: [],
  cpp: [],
  java: ["maven_repository"],
  csharp: ["nuget_feed"],
  javascript: [],
  python: [],
  ruby: [],
  rust: [],
  swift: [],
  go: ["goproxy_server", "git_source"],
} as const;

/**
 * Extracts an `Address` value from the given `Registry` value by determining whether it has
 * a `url` value, or no `url` value but a `host` value.
 *
 * @throws A `ConfigurationError` if the `Registry` value contains neither a `url` or `host` field.
 */
function getRegistryAddress(
  registry: json.UnvalidatedObject<Registry>,
): Address {
  if (
    isDefined(registry.url) &&
    json.isString(registry.url) &&
    json.isStringOrUndefined(registry.host)
  ) {
    return {
      url: registry.url,
      host: registry.host,
    };
  } else if (isDefined(registry.host) && json.isString(registry.host)) {
    return {
      url: undefined,
      host: registry.host,
    };
  } else {
    // The proxy needs one of these to work. If both are defined, the url has the precedence.
    throw new ConfigurationError(
      "Invalid credentials - must specify host or url",
    );
  }
}

/**
 * Returns registry credentials from action inputs.
 * It prefers `registriesCredentials` over `registrySecrets`.
 * If neither is set, it returns an empty array.
 */
export function getCredentials(
  logger: Logger,
  registrySecrets: string | undefined,
  registriesCredentials: string | undefined,
  language: BuiltInLanguage | undefined,
): Credential[] {
  const registryTypeForLanguage = language
    ? LANGUAGE_TO_REGISTRY_TYPE[language]
    : undefined;

  let credentialsStr: string;
  if (registriesCredentials !== undefined) {
    logger.info(`Using registries_credentials input.`);
    credentialsStr = Buffer.from(registriesCredentials, "base64").toString();
  } else if (registrySecrets !== undefined) {
    logger.info(`Using registry_secrets input.`);
    credentialsStr = registrySecrets;
  } else {
    logger.info(`No credentials defined.`);
    return [];
  }

  // Parse and validate the credentials
  let parsed: unknown;
  try {
    parsed = json.parseString(credentialsStr);
  } catch {
    // Don't log the error since it might contain sensitive information.
    logger.error("Failed to parse the credentials data.");
    throw new ConfigurationError("Invalid credentials format.");
  }

  // Check that the parsed data is indeed an array.
  if (!json.isArray(parsed)) {
    throw new ConfigurationError(
      "Expected credentials data to be an array of configurations, but it is not.",
    );
  }

  const out: Credential[] = [];
  for (const e of parsed) {
    if (e === null || !json.isObject<RawCredential>(e)) {
      throw new ConfigurationError("Invalid credentials - must be an object");
    }

    // The configuration must have a type.
    if (!isDefined(e.type) || !json.isString(e.type)) {
      throw new ConfigurationError("Invalid credentials - must have a type");
    }

    // Mask credentials to reduce chance of accidental leakage in logs.
    const authConfig = getAuthConfig(e);
    const address = getRegistryAddress(e);

    // Filter credentials based on language if specified. `type` is the registry type.
    // E.g., "maven_repository" for Java/Kotlin, "nuget_feed" for C#.
    // We always allow types in `ALWAYS_ENABLED_REGISTRY_TYPE` since they can be used by
    // other parts of the workflow.
    if (
      !ALWAYS_ENABLED_REGISTRY_TYPE.some((t) => t === e.type) &&
      registryTypeForLanguage &&
      !registryTypeForLanguage.some((t) => t === e.type)
    ) {
      continue;
    }

    const isPrintable = (str: string | undefined): boolean => {
      return str ? /^[\x20-\x7E]*$/.test(str) : true;
    };

    // Ensure that all string fields only contain printable characters.
    for (const key of Object.keys(e)) {
      const val = e[key];
      if (typeof val === "string" && !isPrintable(val)) {
        throw new ConfigurationError(
          "Invalid credentials - fields must contain only printable characters",
        );
      }
    }

    // If the password or token looks like a GitHub PAT, warn if no username is configured.
    const noUsername =
      !hasUsername(authConfig) || !isDefined(authConfig.username);
    const passwordIsPAT =
      hasUsernameAndPassword(authConfig) &&
      isDefined(authConfig.password) &&
      isPAT(authConfig.password);
    const tokenIsPAT =
      hasToken(authConfig) &&
      isDefined(authConfig.token) &&
      isPAT(authConfig.token);

    if (noUsername && (passwordIsPAT || tokenIsPAT)) {
      logger.warning(
        `A ${e.type} private registry is configured for ${e.host || e.url} using a GitHub Personal Access Token (PAT), but no username was provided. ` +
          `This may not work correctly. When configuring a private registry using a PAT, select "Username and password" and enter the username of the user ` +
          `who generated the PAT.`,
      );
    }

    // Construct the base credential object.
    const baseCredential: Omit<Registry, keyof Address> = { type: e.type };

    // If "replaces-base" is present, it must be a boolean.
    if ("replaces-base" in e) {
      if (
        isDefined(e["replaces-base"]) &&
        typeof e["replaces-base"] === "boolean"
      ) {
        baseCredential["replaces-base"] = e["replaces-base"];
      } else {
        throw new ConfigurationError(
          "Invalid credentials - 'replaces-base' must be a boolean",
        );
      }
    }

    out.push({
      ...baseCredential,
      ...authConfig,
      ...address,
    });
  }
  return out;
}

/**
 * Gets the name of the proxy release asset for the current platform.
 *
 * @param platform The platform to get the asset name for.
 */
export function getProxyPackage(platform: BundlePlatform): string {
  return `${UPDATEJOB_PROXY}-${platform}.tar.gz`;
}

/** Uses `features` to determine the default CLI version. */
async function getCliVersionFromFeatures(
  features: FeatureEnablement,
): Promise<CodeQLDefaultVersionInfo> {
  const gitHubVersion = await getGitHubVersion();
  return await features.getEnabledDefaultCliVersions(gitHubVersion.type);
}

/**
 * Determines the URL of the proxy release asset that we should download if its not
 * already in the toolcache, and its version.
 *
 * @param action The action state.
 * @returns Returns the download URL and version of the proxy package we plan to use.
 */
export async function getDownloadUrl(
  action: ActionState<["Base", "ReadOnlyEnv", "Logger", "FeatureFlags"]>,
  apiDetails: GitHubApiDetails,
): Promise<{ url: string; version: string }> {
  // Default to linux64 if we don't recognise the platform+arch pair.
  // This maintains the behaviour we had before switching to `getBundlePlatform` here.
  let platform = getBundlePlatform(action.platform, action.arch);
  if (platform === undefined) {
    action.logger.warning(
      `Unsupported platform ${action.platform} on architecture ${action.arch}, defaulting to ${BundlePlatform.Linux64}`,
    );
    platform = BundlePlatform.Linux64;
  }

  const proxyPackage = getProxyPackage(platform);

  try {
    const useFeaturesToDetermineCLI = await action.features.getValue(
      Feature.StartProxyUseFeaturesRelease,
    );

    // Retrieve information about the CLI version we should use. This will be either the linked
    // version, or the one enabled by FFs.
    const versionInfo = useFeaturesToDetermineCLI
      ? (await getCliVersionFromFeatures(action.features)).enabledVersions[0]
      : {
          cliVersion: defaults.cliVersion,
          tagName: defaults.bundleVersion,
        };

    // Try to retrieve information about the CLI bundle release identified by `versionInfo`.
    const proxyAssetUrl = await getCodeQLAssetDownloadURL(
      action,
      apiDetails,
      versionInfo.tagName,
      proxyPackage,
      "private registry proxy",
    );

    return {
      url: proxyAssetUrl,
      // The `update-job-proxy` doesn't have a version as such. Since we now bundle it
      // with CodeQL CLI bundle releases, we use the corresponding CLI version to
      // differentiate between (potentially) different versions of `update-job-proxy`.
      version: versionInfo.cliVersion,
    };
  } catch (ex) {
    throw new Error(
      `Failed to retrieve information about the linked release: ${getErrorMessage(ex)}`,
    );
  }
}

/**
 * Attempts to download a file from `url` into the toolcache.
 *
 * @param logger The logger to use.
 * @param url The URL to download the proxy binary from.
 * @param authorization The authorization information to use.
 * @returns If successful, the path to the downloaded file.
 */
export async function downloadProxy(
  logger: Logger,
  url: string,
  authorization: string | undefined,
) {
  try {
    // Download the proxy archive from `url`. We let `downloadTool` choose where
    // to store it. The path to the downloaded file will be returned if successful.
    return await toolcache.downloadTool(
      url,
      /* dest: */ undefined,
      authorization,
      {
        accept: "application/octet-stream",
      },
    );
  } catch (error) {
    logger.error(
      `Failed to download proxy archive from ${url}: ${getErrorMessage(error)}`,
    );
    throw new StartProxyError(StartProxyErrorType.DownloadFailed);
  }
}

/**
 * Attempts to extract the proxy binary from the `archive`.
 *
 * @param logger The logger to use.
 * @param archive The archive to extract.
 * @returns The path to the extracted file(s).
 */
export async function extractProxy(logger: Logger, archive: string) {
  try {
    return await toolcache.extractTar(archive);
  } catch (error) {
    logger.error(
      `Failed to extract proxy archive from ${archive}: ${getErrorMessage(error)}`,
    );
    throw new StartProxyError(StartProxyErrorType.ExtractionFailed);
  }
}

/**
 * Attempts to store the proxy in the toolcache.
 *
 * @param logger The logger to use.
 * @param source The source path to add to the toolcache.
 * @param filename The filename of the proxy binary.
 * @param version The version of the proxy.
 * @returns The path to the directory in the toolcache.
 */
export async function cacheProxy(
  logger: Logger,
  source: string,
  filename: string,
  version: string,
) {
  try {
    return await toolcache.cacheDir(source, filename, version);
  } catch (error) {
    logger.error(
      `Failed to add proxy archive from ${source} to toolcache: ${getErrorMessage(error)}`,
    );
    throw new StartProxyError(StartProxyErrorType.CacheFailed);
  }
}

/**
 * Returns the platform-specific filename of the proxy binary.
 */
export function getProxyFilename() {
  return process.platform === "win32"
    ? `${UPDATEJOB_PROXY}.exe`
    : UPDATEJOB_PROXY;
}

export type ProxyBinary = {
  /** The path to the proxy binary to run. */
  path: string;
  /**
   * The version associated with the proxy binary.
   * This usually corresponds to the CodeQL CLI release that the binary was obtained from.
   */
  version: string;
};

/**
 * Gets a path to the proxy binary. If possible, this function will find the proxy in the
 * runner's tool cache. Otherwise, it downloads and extracts the proxy binary,
 * and stores it in the tool cache.
 *
 * @param action The action state.
 * @returns The path to the proxy binary and its version.
 */
export async function getProxyBinaryPath(
  action: ActionState<["Base", "ReadOnlyEnv", "Logger", "FeatureFlags"]>,
  apiDetails: GitHubApiDetails,
): Promise<ProxyBinary> {
  const logger = action.logger;
  logger.startGroup("Setting up authentication proxy");

  try {
    const client = new InstanceApiClient(apiDetails);
    const proxyFileName = getProxyFilename();
    const proxyInfo = await getDownloadUrl(action, apiDetails);

    logger.info(
      `Using authentication proxy from CodeQL release ${proxyInfo.version}.`,
    );

    let proxyDir = toolcache.find(proxyFileName, proxyInfo.version);

    if (!proxyDir) {
      logger.info(
        `Authentication proxy is not in the toolcache. Will try to download it from '${proxyInfo.url}'.`,
      );

      const authorization = client.getAuthorizationHeaderFor(
        logger,
        proxyInfo.url,
      );
      const temp = await downloadProxy(logger, proxyInfo.url, authorization);

      logger.info(`Downloaded the authentication proxy asset to '${temp}'.`);

      const extracted = await extractProxy(logger, temp);
      proxyDir = await cacheProxy(
        logger,
        extracted,
        proxyFileName,
        proxyInfo.version,
      );

      logger.info(`Extracted the authentication proxy to '${proxyDir}'.`);
    }
    return {
      path: path.join(proxyDir, proxyFileName),
      version: proxyInfo.version,
    };
  } finally {
    logger.endGroup();
  }
}
