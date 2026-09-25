import * as fs from "fs";
import { OutgoingHttpHeaders } from "http";
import * as path from "path";
import { performance } from "perf_hooks";

import * as core from "@actions/core";
import * as toolcache from "@actions/tool-cache";
import { default as deepEqual } from "fast-deep-equal";
import * as semver from "semver";
import { v4 as uuidV4 } from "uuid";

import { ActionState } from "./action-common";
import {
  isAnalyzingPullRequest,
  isDynamicWorkflow,
  isGitHubHostedRunner,
  isRunningLocalAction,
} from "./actions-util";
import * as api from "./api-client";
import {
  CodeQLBundle,
  CodeQLDownloadSource,
  getCodeQLBundleFromUrl,
} from "./codeql-bundle";
import {
  BundleSelection,
  BundleSelectionOptions,
  getPublicRelease,
  getRelease,
  selectBundle,
} from "./codeql-release";
import * as defaults from "./defaults.json";
import {
  addNoLanguageDiagnostic,
  makeDiagnostic,
  makeTelemetryDiagnostic,
} from "./diagnostics";
import { EnvVar, getEnv } from "./environment";
import {
  CodeQLDefaultVersionInfo,
  CodeQLVersionInfo,
  Feature,
  FeatureEnablement,
} from "./feature-flags";
import { Logger } from "./logging";
import { getCodeQlVersionsForOverlayBaseDatabases } from "./overlay/caching";
import { logMissingPerLanguageBundle } from "./per-language-bundles";
import { getBundlePlatform } from "./platform";
import * as tar from "./tar";
import {
  deleteToolcacheBundles,
  downloadAndExtract,
  getToolcacheDirectory,
  isToolcacheOnWorkspaceFilesystem,
  ToolsDownloadStatusReport,
  writeToolcacheMarkerFile,
} from "./tools-download";
import * as util from "./util";
import { isGoodVersion } from "./util";

export type { CodeQLDownloadSource } from "./codeql-bundle";

export enum ToolsSource {
  Unknown = "UNKNOWN",
  Local = "LOCAL",
  Toolcache = "TOOLCACHE",
  Download = "DOWNLOAD",
}

const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";
const CODEQL_NIGHTLIES_REPOSITORY_OWNER = "dsp-testing";
const CODEQL_NIGHTLIES_REPOSITORY_NAME = "codeql-cli-nightlies";

const CODEQL_BUNDLE_VERSION_ALIAS: string[] = ["linked", "latest"];
const CODEQL_NIGHTLY_TOOLS_INPUTS = ["nightly", "nightly-latest"];
const CODEQL_TOOLCACHE_INPUT = "toolcache";

export function getCodeQLActionRepository(logger: Logger): string {
  if (isRunningLocalAction()) {
    // This handles the case where the Action does not come from an Action repository,
    // e.g. our integration tests which use the Action code from the current checkout.
    // In these cases, the GITHUB_ACTION_REPOSITORY environment variable is not set.
    logger.info(
      "The CodeQL Action is checked out locally. Using the default CodeQL Action repository.",
    );
    return CODEQL_DEFAULT_ACTION_REPOSITORY;
  }

  return util.getRequiredEnvParam("GITHUB_ACTION_REPOSITORY");
}

/**
 * Selects a bundle from the first release tagged `tagName` that has a compatible bundle, trying the
 * Action repositories on this GitHub instance before the canonical Action on GitHub.com. If we
 * can't look up a release, or it has no compatible bundle, we move on to the next repository. We
 * assume that the public release on GitHub.com has every bundle.
 */
async function selectDefaultBundle(
  action: ActionState<["Logger", "ReadOnlyEnv", "FeatureFlags"]>,
  tagName: string,
  apiDetails: api.GitHubApiDetails,
  options: BundleSelectionOptions,
): Promise<BundleSelection> {
  const { logger } = action;
  const codeQLActionRepository = getCodeQLActionRepository(logger);
  const potentialDownloadSources = [
    // This GitHub instance, and this Action.
    [apiDetails.url, codeQLActionRepository],
    // This GitHub instance, and the canonical Action.
    [apiDetails.url, CODEQL_DEFAULT_ACTION_REPOSITORY],
    // GitHub.com, and the canonical Action.
    [util.GITHUB_DOTCOM_URL, CODEQL_DEFAULT_ACTION_REPOSITORY],
  ];
  // We now filter out any duplicates.
  // Duplicates will happen either because the GitHub instance is GitHub.com, or because the Action is not a fork.
  const uniqueDownloadSources = potentialDownloadSources.filter(
    (source, index, self) => {
      return !self.slice(0, index).some((other) => deepEqual(source, other));
    },
  );
  for (const [serverURL, repository] of uniqueDownloadSources) {
    // If we've reached the final case, short-circuit the API check since we know the bundle exists and is public.
    if (
      serverURL === util.GITHUB_DOTCOM_URL &&
      repository === CODEQL_DEFAULT_ACTION_REPOSITORY
    ) {
      break;
    }
    const [owner, repo] = repository.split("/");
    try {
      const release = await getRelease(
        { apiClient: api.getApiClient() },
        { serverURL, owner, repo, tagName },
      );
      return await selectBundle(action, release, options);
    } catch (e) {
      logger.info(
        `Looked for CodeQL bundles in release ${tagName} of ${repository} on ${serverURL} but got error ${e}.`,
      );
    }
  }
  const [owner, repo] = CODEQL_DEFAULT_ACTION_REPOSITORY.split("/");
  return selectBundle(
    action,
    getPublicRelease({
      serverURL: util.GITHUB_DOTCOM_URL,
      owner,
      repo,
      tagName,
    }),
    options,
  );
}

function tryGetBundleVersionFromTagName(
  tagName: string,
  logger: Logger,
): string | undefined {
  const match = tagName.match(/^codeql-bundle-(.+)$/);
  if (match === null || match.length < 2) {
    logger.debug(`Could not determine bundle version from tag ${tagName}.`);
    return undefined;
  }
  return match[1];
}

export function tryGetTagNameFromUrl(
  url: string,
  logger: Logger,
): string | undefined {
  const matches = [...url.matchAll(/\/(codeql-bundle-[^/]*)\//g)];
  if (matches.length === 0) {
    logger.debug(`Could not determine tag name for URL ${url}.`);
    return undefined;
  }
  // Example: https://github.com/org/codeql-bundle-testing/releases/download/codeql-bundle-v2.19.0/codeql-bundle-linux64.tar.zst
  // We require a trailing forward slash to be part of the match, so the last match gives us the tag
  // name. An alternative approach would be to also match against `/releases/`, but this approach
  // assumes less about the structure of the URL.
  const match = matches[matches.length - 1];

  if (match?.length !== 2) {
    logger.debug(
      `Could not determine tag name for URL ${url}. Matched ${JSON.stringify(
        match,
      )}.`,
    );
    return undefined;
  }

  return match[1];
}

/**
 * Converts a bundle version to a semantic version, for example to use in the toolcache. Semantic
 * versions are normalized with `semver.clean`, which drops a leading `v` and any build metadata.
 * Anything else, such as a date, becomes a prerelease of `0.0.0`. Throws if the result isn't a
 * valid semantic version.
 */
export function convertToSemVer(version: string, logger: Logger): string {
  if (!semver.valid(version)) {
    logger.debug(
      `Bundle version ${version} is not in SemVer format. Will treat it as pre-release 0.0.0-${version}.`,
    );
    version = `0.0.0-${version}`;
  }

  const s = semver.clean(version);
  if (!s) {
    throw new Error(`Bundle version ${version} is not in SemVer format.`);
  }

  return s;
}

export type CodeQLToolsSource =
  | {
      codeqlTarPath: string;
      compressionMethod: tar.CompressionMethod;
      sourceType: "local";
      /** Human-readable description of the source of the tools for telemetry purposes. */
      toolsVersion: "local";
    }
  | {
      codeqlFolder: string;
      sourceType: "toolcache";
      /** Human-readable description of the source of the tools for telemetry purposes. */
      toolsVersion: string;
    }
  | CodeQLDownloadSource;

/**
 * Look for a version of the CodeQL tools in the cache which could override the requested CLI version.
 */
async function findOverridingToolsInCache(
  humanReadableVersion: string,
  logger: Logger,
): Promise<CodeQLToolsSource | undefined> {
  const candidates = toolcache
    .findAllVersions("CodeQL")
    .filter(isGoodVersion)
    .map((version) => ({
      folder: toolcache.find("CodeQL", version),
      version,
    }))
    .filter(({ folder }) => fs.existsSync(path.join(folder, "pinned-version")));

  if (candidates.length === 1) {
    const candidate = candidates[0];
    logger.debug(
      `CodeQL tools version ${candidate.version} in toolcache overriding version ${humanReadableVersion}.`,
    );
    return {
      codeqlFolder: candidate.folder,
      sourceType: "toolcache",
      toolsVersion: candidate.version,
    };
  } else if (candidates.length === 0) {
    logger.debug(
      "Did not find any candidate pinned versions of the CodeQL tools in the toolcache.",
    );
  } else {
    logger.debug(
      "Could not use CodeQL tools from the toolcache since more than one candidate pinned " +
        "version was found in the toolcache.",
    );
  }
  return undefined;
}

/**
 * Returns the sorted set of enabled versions that have cached overlay-base databases for the
 * given languages, or an empty list if neither the `OverlayAnalysisMatchCodeqlVersion` nor the
 * `OverlayAnalysisMatchCodeqlVersionDryRun` feature flag is enabled. When only the dry-run flag
 * is enabled, this performs the lookup and emits a telemetry diagnostic with the version that
 * would have been chosen, but still returns an empty list so the caller falls back.
 */
export async function getEnabledVersionsWithOverlayBaseDatabases(
  defaultCliVersion: CodeQLDefaultVersionInfo,
  rawLanguages: string[] | undefined,
  features: FeatureEnablement,
  logger: Logger,
): Promise<CodeQLVersionInfo[]> {
  if (rawLanguages === undefined || rawLanguages.length === 0) {
    return [];
  }
  const isEnabled = await features.getValue(
    Feature.OverlayAnalysisMatchCodeqlVersion,
  );
  const isDryRun =
    !isEnabled &&
    (await features.getValue(Feature.OverlayAnalysisMatchCodeqlVersionDryRun));
  if (!isEnabled && !isDryRun) {
    return [];
  }

  let cachedVersions: string[] | undefined;
  try {
    cachedVersions = await getCodeQlVersionsForOverlayBaseDatabases(
      rawLanguages,
      logger,
    );
  } catch (e) {
    logger.warning(
      "Could not list overlay-base databases in the Actions cache while choosing a default " +
        `CodeQL CLI version, falling back to the highest enabled version. Details: ${util.getErrorMessage(e)}`,
    );
    return [];
  }

  if (cachedVersions === undefined || cachedVersions.length === 0) {
    return [];
  }

  const cachedVersionsSet = new Set(cachedVersions);
  const overlayVersions = defaultCliVersion.enabledVersions.filter((v) =>
    cachedVersionsSet.has(v.cliVersion),
  );

  if (overlayVersions.length === 0) {
    return [];
  }

  const isCachedVersionDifferent =
    overlayVersions[0].cliVersion !==
    defaultCliVersion.enabledVersions[0].cliVersion;

  if (isCachedVersionDifferent) {
    addNoLanguageDiagnostic(
      undefined,
      makeTelemetryDiagnostic(
        "codeql-action/overlay-aware-default-codeql-version",
        "Overlay-aware default CodeQL version selection",
        {
          cachedVersions,
          enabledVersions: defaultCliVersion.enabledVersions.map(
            (v) => v.cliVersion,
          ),
          isDryRun,
          overlayAwareVersion: overlayVersions[0].cliVersion,
        },
      ),
    );
  }

  if (isDryRun) {
    logger.debug(
      `Overlay-aware default CodeQL version selection is running in dry-run mode. Would have used version ${overlayVersions[0].cliVersion}.`,
    );
    return [];
  }

  return overlayVersions;
}

/**
 * Resolves the newest enabled default CLI version that has a cached overlay-base database for the
 * relevant languages, if running a Code Scanning analysis for a pull request and one exists.
 * Otherwise, falls back to the newest enabled default CLI version.
 */
async function resolveDefaultCliVersion(
  defaultCliVersion: CodeQLDefaultVersionInfo,
  rawLanguages: string[] | undefined,
  useOverlayAwareDefaultCliVersion: boolean,
  features: FeatureEnablement,
  logger: Logger,
): Promise<CodeQLVersionInfo> {
  if (!useOverlayAwareDefaultCliVersion || !isAnalyzingPullRequest()) {
    return defaultCliVersion.enabledVersions[0];
  }

  const overlayVersions = await getEnabledVersionsWithOverlayBaseDatabases(
    defaultCliVersion,
    rawLanguages,
    features,
    logger,
  );
  if (overlayVersions.length > 0) {
    logger.info(
      `Using CodeQL version ${overlayVersions[0].cliVersion} since this is the ` +
        `highest enabled version that has a cached overlay-base database.`,
    );
    return overlayVersions[0];
  }
  return defaultCliVersion.enabledVersions[0];
}

/**
 * Determines where the CodeQL CLI we want to use comes from. This can be from a local file,
 * the Actions toolcache, or a download.
 *
 * We handle the `tools` input in this order:
 *
 * - A local path is extracted without using the toolcache.
 * - `nightly` or `nightly-latest`, or the `force_nightly` feature flag in a dynamic workflow,
 *   selects a bundle from the latest nightly release. We then continue with that bundle's URL.
 * - `linked`, or its old name `latest`, selects the version shipped with the Action.
 * - `toolcache` selects the latest version in the toolcache, falling back to the default version
 *   outside dynamic workflows or if there isn't one.
 * - Any other value is the URL of a bundle.
 * - Without a `tools` input, we use the default version.
 *
 * Apart from a local path, we look for the resolved version in the toolcache before downloading. A
 * cached version takes precedence even if the job could use a per-language bundle.
 *
 * @param toolsInput The argument provided for the `tools` input, if any.
 * @param defaultCliVersion The default CLI version that's linked to the CodeQL Action.
 * @param rawLanguages Raw set of languages.
 * @param useOverlayAwareDefaultCliVersion Whether to select an overlay-aware default CLI version.
 * @param apiDetails Information about the GitHub API.
 * @param variant The GitHub variant we are running on.
 * @param tarSupportsZstd Whether zstd is supported by `tar`.
 * @param features Information about enabled features.
 * @param logger The logger to use.
 *
 * @returns Information about where the CodeQL CLI we want to use comes from.
 */
export async function getCodeQLSource(
  toolsInput: string | undefined,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  rawLanguages: string[] | undefined,
  useOverlayAwareDefaultCliVersion: boolean,
  apiDetails: api.GitHubApiDetails,
  variant: util.GitHubVariant,
  tarSupportsZstd: boolean,
  features: FeatureEnablement,
  logger: Logger,
): Promise<CodeQLToolsSource> {
  // If there is an explicit `tools` input, it's not one of the reserved values, and it doesn't appear
  // to point to a URL, then we assume it is a local path and use the CLI from there.
  // TODO: This appears to misclassify filenames that happen to start with `http` as URLs.
  if (
    toolsInput &&
    !isReservedToolsValue(toolsInput) &&
    !toolsInput.startsWith("http")
  ) {
    logger.info(`Using CodeQL CLI from local path ${toolsInput}`);
    const compressionMethod = tar.inferCompressionMethod(toolsInput);
    if (compressionMethod === undefined) {
      throw new util.ConfigurationError(
        `Could not infer compression method from path ${toolsInput}. Please specify a path ` +
          "ending in '.tar.gz' or '.tar.zst'.",
      );
    }
    return {
      codeqlTarPath: toolsInput,
      compressionMethod,
      sourceType: "local",
      toolsVersion: "local",
    };
  }

  /** Requested CLI version number, for example 2.12.6. */
  let cliVersion: string | undefined;
  /** Tag name of the CodeQL bundle, for example `codeql-bundle-20230120`. */
  let tagName: string | undefined;
  /**
   * URL of the CodeQL bundle.
   *
   * This does not always include a tag name.
   */
  let url: string | undefined;
  let bundle: CodeQLBundle | undefined;

  // We allow forcing the nightly CLI via the FF for `dynamic` events (or in test mode) where the
  // `tools` input cannot be adjusted to explicitly request it.
  const canForceNightlyWithFF = isDynamicWorkflow() || util.isInTestMode();
  const forceNightlyValueFF = await features.getValue(Feature.ForceNightly);
  const forceNightly = forceNightlyValueFF && canForceNightlyWithFF;

  // For advanced workflows, a value from `CODEQL_NIGHTLY_TOOLS_INPUTS` can be specified explicitly
  // for the `tools` input. This is the computed input, so it may come from the repository property
  // rather than the workflow file.
  const nightlyRequestedByToolsInput =
    toolsInput !== undefined &&
    CODEQL_NIGHTLY_TOOLS_INPUTS.includes(toolsInput);

  if (forceNightly || nightlyRequestedByToolsInput) {
    if (forceNightly) {
      logger.info(
        `Using the latest CodeQL CLI nightly, as forced by the ${Feature.ForceNightly} feature flag.`,
      );
      addNoLanguageDiagnostic(
        undefined,
        makeDiagnostic(
          "codeql-action/forced-nightly-cli",
          "A nightly release of CodeQL was used",
          {
            markdownMessage:
              "GitHub configured this analysis to use a nightly release of CodeQL to allow you to preview changes from an upcoming release.\n\n" +
              "Nightly releases do not undergo the same validation as regular releases and may lead to analysis instability.\n\n" +
              "If use of a nightly CodeQL release for this analysis is unexpected, please contact GitHub support.",
            visibility: {
              cliSummaryTable: true,
              statusPage: true,
              telemetry: true,
            },
            severity: "note",
          },
        ),
      );
    } else {
      logger.info(
        `Using the latest CodeQL CLI nightly, as requested by 'tools: ${toolsInput}'.`,
      );
    }
    bundle = await getLatestNightlyBundle(
      { env: getEnv(), features, logger },
      rawLanguages,
      variant,
      tarSupportsZstd,
    );
    toolsInput = bundle.url;
  }

  /**
   * Whether the tools shipped with the Action, i.e. those in `defaults.json`, have been forced.
   *
   * We use the special value of 'linked' to prioritize the version in `defaults.json` over the
   * version specified by the feature flags on Dotcom and over any pinned cached version on
   * Enterprise Server.
   *
   * Previously we have been using 'latest' to force the shipped tools, but this was not clear
   * enough for the users, so it has been changed to `linked`. We're keeping around `latest` for
   * backwards compatibility.
   */
  const forceShippedTools =
    toolsInput && CODEQL_BUNDLE_VERSION_ALIAS.includes(toolsInput);

  if (forceShippedTools) {
    cliVersion = defaults.cliVersion;
    tagName = defaults.bundleVersion;

    logger.info(
      `'tools: ${toolsInput}' was requested, so using CodeQL version ${cliVersion}, the version shipped with the Action.`,
    );

    if (toolsInput === "latest") {
      logger.warning(
        "`tools: latest` has been renamed to `tools: linked`, but the old name is still supported. No action is required.",
      );
    }
  } else if (
    toolsInput !== undefined &&
    toolsInput === CODEQL_TOOLCACHE_INPUT
  ) {
    let latestToolcacheVersion: string | undefined;

    // We only allow `toolsInput === "toolcache"` for `dynamic` events. In general, using `toolsInput === "toolcache"`
    // can lead to alert wobble and so it shouldn't be used for an analysis where results are intended to be uploaded.
    // We also allow this in test mode.
    const allowToolcacheValue = isDynamicWorkflow() || util.isInTestMode();
    if (allowToolcacheValue) {
      // If `toolsInput === "toolcache"`, try to find the latest version of the CLI that's available in the toolcache
      // and use that. We perform this check here since we can set `cliVersion` directly and don't want to default to
      // the linked version.
      logger.info(
        `Attempting to use the latest CodeQL CLI version in the toolcache, as requested by 'tools: ${toolsInput}'.`,
      );

      latestToolcacheVersion = getLatestToolcacheVersion(logger);
      if (latestToolcacheVersion) {
        cliVersion = latestToolcacheVersion;
      }
    }

    if (latestToolcacheVersion === undefined) {
      if (allowToolcacheValue) {
        logger.info(
          `Found no CodeQL CLI in the toolcache, ignoring 'tools: ${toolsInput}'...`,
        );
      } else {
        logger.warning(
          `Ignoring 'tools: ${toolsInput}' because the workflow was not triggered dynamically.`,
        );
      }

      const version = await resolveDefaultCliVersion(
        defaultCliVersion,
        rawLanguages,
        useOverlayAwareDefaultCliVersion,
        features,
        logger,
      );
      cliVersion = version.cliVersion;
      tagName = version.tagName;
    }
  } else if (toolsInput !== undefined) {
    // Any other value is a bundle URL, including one we selected from the latest nightly above.
    // We use the version in its tag, if any, for the toolcache, so we assume that bundles with the
    // same version are the same build, whichever repository they're in.
    tagName = tryGetTagNameFromUrl(toolsInput, logger);
    url = toolsInput;

    if (tagName) {
      const bundleVersion = tryGetBundleVersionFromTagName(tagName, logger);
      // If the bundle version is a semantic version, it is a CLI version number.
      if (bundleVersion !== undefined && semver.valid(bundleVersion)) {
        cliVersion = convertToSemVer(bundleVersion, logger);
      }
    }
  } else {
    const version = await resolveDefaultCliVersion(
      defaultCliVersion,
      rawLanguages,
      useOverlayAwareDefaultCliVersion,
      features,
      logger,
    );
    cliVersion = version.cliVersion;
    tagName = version.tagName;
  }

  const bundleVersion =
    tagName !== undefined
      ? tryGetBundleVersionFromTagName(tagName, logger)
      : undefined;
  const resolvedVersion =
    cliVersion ??
    (bundleVersion !== undefined
      ? convertToSemVer(bundleVersion, logger)
      : undefined);
  const humanReadableVersion = resolvedVersion ?? tagName ?? url ?? "unknown";

  logger.debug(
    "Attempting to obtain CodeQL tools. " +
      `CLI version: ${cliVersion ?? "unknown"}, ` +
      `bundle tag name: ${tagName ?? "unknown"}, ` +
      `URL: ${url ?? "unspecified"}.`,
  );

  const codeqlFolder = await findCodeQLInToolcache(
    cliVersion,
    tagName,
    humanReadableVersion,
    logger,
  );
  if (codeqlFolder) {
    if (cliVersion) {
      logger.info(
        `Using CodeQL CLI version ${cliVersion} from toolcache at ${codeqlFolder}`,
      );
    } else {
      logger.info(`Using CodeQL CLI from toolcache at ${codeqlFolder}`);
    }
    return {
      codeqlFolder,
      sourceType: "toolcache",
      toolsVersion: cliVersion ?? humanReadableVersion,
    };
  }

  // If we don't find the requested version on Enterprise, we may allow a
  // different version to save download time if the version hasn't been
  // specified explicitly (in which case we always honor it).
  if (
    variant === util.GitHubVariant.GHES &&
    !forceShippedTools &&
    !toolsInput
  ) {
    const result = await findOverridingToolsInCache(
      humanReadableVersion,
      logger,
    );
    if (result !== undefined) {
      return result;
    }
  }

  let compressionMethod: tar.CompressionMethod;
  let perLanguageBundleFallback: true | undefined;

  if (!url) {
    if (tagName === undefined) {
      throw new Error(
        "Could not determine a release tag for the requested CodeQL bundle.",
      );
    }
    ({ bundle, compressionMethod, perLanguageBundleFallback } =
      await selectDefaultBundle(
        { env: getEnv(), features, logger },
        tagName,
        apiDetails,
        {
          rawLanguages,
          cliVersion,
          platform: getBundlePlatform(),
          variant,
          tarSupportsZstd,
        },
      ));
    url = bundle.url;
  } else {
    const method = tar.inferCompressionMethod(url);
    if (method === undefined) {
      throw new util.ConfigurationError(
        `Could not infer compression method from URL ${url}. Please specify a URL ` +
          "ending in '.tar.gz' or '.tar.zst'.",
      );
    }
    compressionMethod = method;

    // Keep the bundle we selected from the latest nightly, which records the combined bundle to
    // fall back to. Otherwise, classify the explicit URL, which gets no fallback.
    bundle ??= getCodeQLBundleFromUrl(url);
    if (bundle.kind === "per-language") {
      logger.info(
        `${url} appears to be a CodeQL bundle that contains only ${bundle.language}.`,
      );
    }
  }

  if (cliVersion) {
    logger.info(`Using CodeQL CLI version ${cliVersion} sourced from ${url} .`);
  } else {
    logger.info(`Using CodeQL CLI sourced from ${url} .`);
  }
  return {
    bundle,
    bundleVersion,
    cliVersion,
    compressionMethod,
    ...(perLanguageBundleFallback ? { perLanguageBundleFallback } : {}),
    sourceType: "download",
    toolsVersion: resolvedVersion ?? "unknown",
  };
}

/**
 * Looks for the requested version of the CodeQL tools in the toolcache, allowing for the different
 * version numbers that toolcaches may use for the same bundle. We try the exact CLI version, then a
 * single `x.y.z-*` entry for that version, then `0.0.0-<bundle version>`. The `x.y.z-*` entry can
 * be any prerelease of the CLI version.
 */
async function findCodeQLInToolcache(
  cliVersion: string | undefined,
  tagName: string | undefined,
  humanReadableVersion: string,
  logger: Logger,
): Promise<string | undefined> {
  let codeqlFolder: string | undefined;

  if (cliVersion) {
    // If we find the specified CLI version, we always use that.
    codeqlFolder = toolcache.find("CodeQL", cliVersion);

    // Fall back to a single `x.y.z-*` entry, since older toolcaches store bundles as
    // `x.y.z-<bundle version>`.
    if (!codeqlFolder) {
      logger.debug(
        "Didn't find a version of the CodeQL tools in the toolcache with a version number " +
          `exactly matching ${cliVersion}.`,
      );
      const allVersions = toolcache.findAllVersions("CodeQL");
      logger.debug(
        `Found the following versions of the CodeQL tools in the toolcache: ${JSON.stringify(
          allVersions,
        )}.`,
      );
      const candidateVersions = allVersions.filter((version) =>
        version.startsWith(`${cliVersion}-`),
      );
      if (candidateVersions.length === 1) {
        logger.debug(
          `Exactly one version of the CodeQL tools starting with ${cliVersion} found in the ` +
            "toolcache, using that.",
        );
        codeqlFolder = toolcache.find("CodeQL", candidateVersions[0]);
      } else if (candidateVersions.length === 0) {
        logger.debug(
          `Didn't find any versions of the CodeQL tools starting with ${cliVersion} ` +
            `in the toolcache. Trying next fallback method.`,
        );
      } else {
        logger.warning(
          `Found ${candidateVersions.length} versions of the CodeQL tools starting with ` +
            `${cliVersion} in the toolcache, but at most one was expected.`,
        );
        logger.debug("Trying next fallback method.");
      }
    }
  }

  // Fall back to matching `0.0.0-<bundleVersion>`.
  if (!codeqlFolder && tagName) {
    const fallbackVersion = await tryGetFallbackToolcacheVersion(
      cliVersion,
      tagName,
      logger,
    );
    if (fallbackVersion) {
      codeqlFolder = toolcache.find("CodeQL", fallbackVersion);
    } else {
      logger.debug(
        "Could not determine a fallback toolcache version number for CodeQL tools version " +
          `${humanReadableVersion}.`,
      );
    }
  }

  if (codeqlFolder) {
    logger.info(
      `Found CodeQL tools version ${humanReadableVersion} in the toolcache.`,
    );
  } else {
    logger.info(
      `Did not find CodeQL tools version ${humanReadableVersion} in the toolcache.`,
    );
  }
  return codeqlFolder;
}

/**
 * Gets a fallback version number to use when looking for CodeQL in the toolcache if we didn't find
 * the `x.y.z` version. This is to support old versions of the toolcache.
 */
async function tryGetFallbackToolcacheVersion(
  cliVersion: string | undefined,
  tagName: string,
  logger: Logger,
): Promise<string | undefined> {
  const bundleVersion = tryGetBundleVersionFromTagName(tagName, logger);
  if (bundleVersion === undefined) {
    return undefined;
  }
  const fallbackVersion = convertToSemVer(bundleVersion, logger);
  logger.debug(
    `Computed a fallback toolcache version number of ${fallbackVersion} for CodeQL version ` +
      `${cliVersion ?? tagName}.`,
  );
  return fallbackVersion;
}

// Exported using `export const` for testing purposes. Specifically, we want to
// be able to stub this function and have other functions in this file use that stub.
export const downloadCodeQL = async function (
  source: CodeQLDownloadSource,
  apiDetails: api.GitHubApiDetails,
  tarVersion: tar.TarVersion | undefined,
  tempDir: string,
  logger: Logger,
): Promise<{
  codeqlFolder: string;
  statusReport: ToolsDownloadStatusReport;
}> {
  const { bundle, compressionMethod } = source;
  const codeqlURL = bundle.url;
  const parsedCodeQLURL = new URL(codeqlURL);
  const searchParams = new URLSearchParams(parsedCodeQLURL.search);
  const headers: OutgoingHttpHeaders = {
    accept: "application/octet-stream",
  };
  let authorization: string | undefined = undefined;

  // We don't want to send an authorization header if there's already a token provided in the URL.
  if (searchParams.has("token")) {
    logger.debug("CodeQL tools URL contains an authorization token.");
  } else {
    authorization = api.getAuthorizationHeaderFor(
      logger,
      apiDetails,
      codeqlURL,
    );
  }

  const toolcacheDestination = getToolcacheDestination({ logger }, source);
  const extractedBundlePath = toolcacheDestination.orElse(
    getTempExtractionDir(tempDir),
  );

  const statusReport = await downloadAndExtract(
    codeqlURL,
    compressionMethod,
    extractedBundlePath,
    authorization,
    { "User-Agent": "CodeQL Action", ...headers },
    tarVersion,
    logger,
  );

  if (toolcacheDestination.isSuccess()) {
    writeToolcacheMarkerFile(toolcacheDestination.value, logger);
  } else {
    logger.debug(toolcacheDestination.value);
  }

  return {
    codeqlFolder: extractedBundlePath,
    statusReport:
      bundle.kind === "per-language"
        ? {
            ...statusReport,
            perLanguage: { tools_bundle_language: bundle.language },
          }
        : source.perLanguageBundleFallback
          ? {
              ...statusReport,
              perLanguage: { tools_per_language_bundle_fallback: true },
            }
          : statusReport,
  };
};

/**
 * Returns the canonical toolcache directory, or the reason the bundle cannot be cached.
 *
 * The toolcache is keyed by version, so we don't cache bundles that would give a later request for
 * the same version the wrong tools, such as per-language bundles, which lack the other languages.
 */
function getToolcacheDestination(
  { logger }: ActionState<["Logger"]>,
  source: CodeQLDownloadSource,
): util.Result<string, string> {
  if (source.bundle.kind !== "combined") {
    return new util.Failure(
      "Not caching the CodeQL tools because they came from a bundle that contains only a " +
        "single language.",
    );
  }
  if (!source.bundleVersion) {
    return new util.Failure(
      "Could not cache CodeQL tools because we could not determine the bundle version from the " +
        `URL ${source.bundle.url}.`,
    );
  }

  return new util.Success(
    getToolcacheDirectory(
      getCanonicalToolcacheVersion(
        source.cliVersion,
        source.bundleVersion,
        logger,
      ),
    ),
  );
}

/**
 * Reclaims disk space by deleting the CodeQL tools from the toolcache, if enabled.
 *
 * On GitHub-hosted runners the toolcache shares a filesystem with the workspace, so tools left in
 * the toolcache take up space that the analysis could use instead. This holds wherever we extract
 * the tools we are obtaining, since the toolcache is on that filesystem either way.
 */
async function tryDeleteToolcacheBundles({
  env,
  features,
  logger,
}: ActionState<["Logger", "ReadOnlyEnv", "FeatureFlags"]>): Promise<void> {
  // A step that has already set up CodeQL may hand out a path into the toolcache that a later step
  // runs, so only the first step to set it up can know that nothing else relies on the toolcache.
  if (env.getOptional(EnvVar.HAS_SET_UP_CODEQL) !== undefined) {
    logger.debug(
      "Not deleting the CodeQL tools from the toolcache since a previous step in this job has " +
        "already set up CodeQL.",
    );
    return;
  }

  if (
    !isGitHubHostedRunner() ||
    !isToolcacheOnWorkspaceFilesystem(logger) ||
    !(await features.getValue(Feature.CleanupToolcacheBundles))
  ) {
    return;
  }

  const result = await deleteToolcacheBundles({ env, logger });

  addNoLanguageDiagnostic(
    undefined,
    makeTelemetryDiagnostic(
      "codeql-action/toolcache-bundle-cleanup",
      "Toolcache CodeQL bundle cleanup",
      { ...result },
    ),
  );
}

export function getCodeQLURLVersion(url: string): string {
  const match = url.match(/\/codeql-bundle-(.*)\//);
  if (match === null || match.length < 2) {
    throw new util.ConfigurationError(
      `Malformed tools url: ${url}. Version could not be inferred`,
    );
  }
  return match[1];
}

/**
 * Returns the toolcache version number to use to store the bundle with the associated CLI version
 * and bundle version.
 *
 * This is the canonical version number, since toolcaches populated by different versions of the
 * CodeQL Action or different runner image creation scripts may store the bundle using a different
 * version number. Functions like `getCodeQLSource` that fetch the bundle from rather than save the
 * bundle to the toolcache should handle these different version numbers.
 */
function getCanonicalToolcacheVersion(
  cliVersion: string | undefined,
  bundleVersion: string,
  logger: Logger,
): string {
  // If the CLI version is unknown, as for nightlies, which are tagged by date, or isn't a plain
  // `x.y.z`, for example a prerelease, cache the bundle under its bundle version, such as
  // `0.0.0-<date>` or `x.y.z-rc.1`, so that it isn't cached as a stable release. However,
  // `convertToSemVer` drops build metadata, so a bundle URL tagged `codeql-bundle-vX.Y.Z+<build>`
  // is still cached as `X.Y.Z`.
  if (!cliVersion?.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)) {
    return convertToSemVer(bundleVersion, logger);
  }
  // Bundles are now semantically versioned and can be looked up based on just the CLI version
  // number, so we can version them in the toolcache using just the CLI version number.
  return cliVersion;
}

interface SetupCodeQLResult {
  codeqlFolder: string;
  toolsDownloadStatusReport?: ToolsDownloadStatusReport;
  toolsSource: ToolsSource;
  toolsVersion: string;
}

/**
 * Obtains the CodeQL bundle, installs it in the toolcache if appropriate, and extracts it.
 *
 * @returns the path to the extracted bundle, and the version of the tools
 */
export async function setupCodeQLBundle(
  toolsInput: string | undefined,
  apiDetails: api.GitHubApiDetails,
  tempDir: string,
  variant: util.GitHubVariant,
  defaultCliVersion: CodeQLDefaultVersionInfo,
  rawLanguages: string[] | undefined,
  useOverlayAwareDefaultCliVersion: boolean,
  features: FeatureEnablement,
  logger: Logger,
): Promise<SetupCodeQLResult> {
  if (!(await util.isBinaryAccessible("tar", logger))) {
    throw new util.ConfigurationError(
      "Could not find tar in PATH, so unable to extract CodeQL bundle.",
    );
  }
  const zstdAvailability = await tar.isZstdAvailable(logger);

  const source = await getCodeQLSource(
    toolsInput,
    defaultCliVersion,
    rawLanguages,
    useOverlayAwareDefaultCliVersion,
    apiDetails,
    variant,
    zstdAvailability.available,
    features,
    logger,
  );

  let codeqlFolder: string;
  let toolsDownloadStatusReport: ToolsDownloadStatusReport | undefined;
  let toolsSource: ToolsSource;
  switch (source.sourceType) {
    case "local": {
      codeqlFolder = await tar.extract(
        source.codeqlTarPath,
        getTempExtractionDir(tempDir),
        source.compressionMethod,
        zstdAvailability.version,
        logger,
      );
      toolsSource = ToolsSource.Local;
      break;
    }
    case "toolcache":
      codeqlFolder = source.codeqlFolder;
      logger.debug(`CodeQL found in cache ${codeqlFolder}`);
      toolsSource = ToolsSource.Toolcache;
      break;
    case "download": {
      const result = await downloadCodeQLBundle(
        { env: getEnv(), features, logger },
        source,
        apiDetails,
        zstdAvailability.version,
        tempDir,
      );
      codeqlFolder = result.codeqlFolder;
      toolsDownloadStatusReport = result.statusReport;
      toolsSource = ToolsSource.Download;
      break;
    }
    default:
      util.assertNever(source);
  }

  // Record that this job now has a copy of the CodeQL tools, so that a later step doesn't delete
  // the toolcache out from under the path we are about to return.
  core.exportVariable(EnvVar.HAS_SET_UP_CODEQL, "true");

  return {
    codeqlFolder,
    toolsDownloadStatusReport,
    toolsSource,
    toolsVersion: source.toolsVersion,
  };
}

/**
 * Performs eligible toolcache cleanup once, then downloads and extracts the resolved bundle.
 *
 * If an automatically selected per-language bundle is missing, downloads the combined bundle
 * from the same release instead. Explicit bundle URLs are not substituted.
 *
 * @returns The extraction directory and download timings.
 */
export async function downloadCodeQLBundle(
  action: ActionState<["Logger", "ReadOnlyEnv", "FeatureFlags"]>,
  source: CodeQLDownloadSource,
  apiDetails: api.GitHubApiDetails,
  tarVersion: tar.TarVersion | undefined,
  tempDir: string,
): Promise<{
  codeqlFolder: string;
  statusReport: ToolsDownloadStatusReport;
}> {
  const { bundle } = source;
  const { logger } = action;

  await tryDeleteToolcacheBundles(action);

  const startTime = performance.now();
  try {
    return await downloadCodeQL(
      source,
      apiDetails,
      tarVersion,
      tempDir,
      logger,
    );
  } catch (e) {
    if (
      bundle.kind !== "per-language" ||
      bundle.combinedBundleURL === undefined ||
      util.asHTTPError(e)?.status !== 404
    ) {
      throw e;
    }
    logMissingPerLanguageBundle(action, bundle.language, bundle.url);

    const result = await downloadCodeQL(
      {
        ...source,
        bundle: { kind: "combined", url: bundle.combinedBundleURL },
        perLanguageBundleFallback: true,
      },
      apiDetails,
      tarVersion,
      tempDir,
      logger,
    );
    return {
      ...result,
      statusReport: {
        ...result.statusReport,
        totalDurationMs: util.durationMsSince(startTime),
      },
    };
  }
}

function getTempExtractionDir(tempDir: string) {
  return path.join(tempDir, uuidV4());
}

/**
 * Selects a bundle from the latest nightly release, preferring a per-language bundle when eligible.
 * Records the combined bundle URL from that release for use if the selected asset is missing.
 */
async function getLatestNightlyBundle(
  action: ActionState<["Logger", "ReadOnlyEnv", "FeatureFlags"]>,
  rawLanguages: string[] | undefined,
  variant: util.GitHubVariant,
  tarSupportsZstd: boolean,
): Promise<CodeQLBundle> {
  let tagName: string;
  try {
    // Since nightlies are prereleases, we can't just download the latest release
    // on the repository. So instead we need to find the latest pre-release
    // version and construct the download URL from that.
    const release = await api.getApiClient().rest.repos.listReleases({
      owner: CODEQL_NIGHTLIES_REPOSITORY_OWNER,
      repo: CODEQL_NIGHTLIES_REPOSITORY_NAME,
      per_page: 1,
      page: 1,
      prerelease: true,
    });
    const latestRelease = release.data[0];
    if (!latestRelease) {
      throw new Error("Could not find the latest nightly release.");
    }
    tagName = latestRelease.tag_name;
  } catch (e) {
    throw new Error(
      `Failed to retrieve the latest nightly release: ${util.wrapError(e)}`,
    );
  }

  const { bundle } = await selectBundle(
    action,
    getPublicRelease({
      serverURL: util.GITHUB_DOTCOM_URL,
      owner: CODEQL_NIGHTLIES_REPOSITORY_OWNER,
      repo: CODEQL_NIGHTLIES_REPOSITORY_NAME,
      tagName,
    }),
    {
      rawLanguages,
      cliVersion: undefined,
      platform: getBundlePlatform(),
      variant,
      tarSupportsZstd,
      isLatestNightly: true,
    },
  );
  return bundle;
}

/**
 * Gets the latest version of the CodeQL CLI that is available in the toolcache, or `undefined`
 * if no CodeQL CLI is available in the toolcache.
 *
 * @param logger The logger to use.
 * @returns The latest version of the CodeQL CLI that is available in the toolcache, or `undefined` if there is none.
 */
export function getLatestToolcacheVersion(logger: Logger): string | undefined {
  const allVersions = toolcache
    .findAllVersions("CodeQL")
    .sort((a, b) => semver.compare(b, a));
  logger.debug(
    `Found the following versions of the CodeQL tools in the toolcache: ${JSON.stringify(
      allVersions,
    )}.`,
  );

  if (allVersions.length > 0) {
    const latestToolcacheVersion = allVersions[0];
    logger.info(
      `CLI version ${latestToolcacheVersion} is the latest version in the toolcache.`,
    );
    return latestToolcacheVersion;
  }

  return undefined;
}

function isReservedToolsValue(tools: string): boolean {
  return (
    CODEQL_BUNDLE_VERSION_ALIAS.includes(tools) ||
    CODEQL_NIGHTLY_TOOLS_INPUTS.includes(tools) ||
    tools === CODEQL_TOOLCACHE_INPUT
  );
}
