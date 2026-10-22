import { ActionState } from "../action-common";
import { isRunningLocalAction } from "../actions-util";
import * as api from "../api-client";
import { ActionsEnvVars } from "../environment";
import { GITHUB_DOTCOM_URL } from "../github";
import {
  isRepositoryNwoStr,
  parseRepositoryNwo,
  type RepositoryNwoStr,
} from "../repository";

/** The NWO of the standard CodeQL Action repository. */
export const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";

/**
 * Retrieves the NWO of the repository that the CodeQL Action is loaded from.
 * Typically, this will be `github/codeql-action`, but it may be something else for
 * forks of the Action or in environments other than GitHub.com.
 *
 * If this function detects that we are running the Action locally (e.g. in tests),
 * then we default to `CODEQL_DEFAULT_ACTION_REPOSITORY`.
 */
export function getCodeQLActionRepository(
  action: ActionState<["ReadOnlyEnv", "Logger"]>,
): RepositoryNwoStr {
  if (isRunningLocalAction(action.env)) {
    // This handles the case where the Action does not come from an Action repository,
    // e.g. our integration tests which use the Action code from the current checkout.
    // In these cases, the GITHUB_ACTION_REPOSITORY environment variable is not set.
    action.logger.info(
      "The CodeQL Action is checked out locally. Using the default CodeQL Action repository.",
    );
    return CODEQL_DEFAULT_ACTION_REPOSITORY;
  }

  const actionRepository = action.env.getRequired(
    ActionsEnvVars.GITHUB_ACTION_REPOSITORY,
  );

  if (isRepositoryNwoStr(actionRepository)) {
    return actionRepository;
  }

  throw new Error(
    `The value of '${ActionsEnvVars.GITHUB_ACTION_REPOSITORY}' is '${actionRepository}', which does not match the expected 'owner/repo' format.`,
  );
}

/**A download source is a pair of strings. */
export type DownloadSource = [api.GitHubApiDetails, RepositoryNwoStr];

/** Decides if the two provided download sources are the same. */
const isSameDownloadSource = (
  [srcInstance, srcRepo]: DownloadSource,
  [otherInstance, otherRepo]: DownloadSource,
) => {
  return srcInstance.url === otherInstance.url && srcRepo === otherRepo;
};

/** A download URL is represented as a string. */
export type DownloadURL = string;

/** Gets the default GitHub.com download URL for `assetName` in a release tagged `tagName`. */
export function getDefaultDotcomDownloadURL(
  tagName: string,
  assetName: string,
): DownloadURL {
  return `${GITHUB_DOTCOM_URL}/${CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${tagName}/${assetName}`;
}

/** Enumerates log-friendly descriptions of different kinds of assets we might look for in releases. */
export type ReleaseAssetKind = "CodeQL bundle" | "private registry proxy";

/**
 * Tries to find a download URL for `assetName` in a release tagged with `tagName`.
 *
 * Depending on where and how the CodeQL Action is running, we may be using different `apiDetails` and there may be
 * different options for where to source CodeQL releases from.
 *
 * This function either returns the download URL for the asset for the first release we find, or
 * defaults to the assumed download URL for the asset on the default CodeQL Action repository on GitHub.com.
 * In the latter case, this function does not guarantee that the asset actually exists.
 *
 * @param action The Action state.
 * @param apiDetails The details of the GitHub API in use.
 * @param tagName The name of the release tag we want to obtain the asset from.
 * @param assetName The name of the asset we should look for in the release.
 * @param [assetKind="CodeQL bundle"] The kind of asset we are looking for to show in log messages.
 * @returns A URL that we can use to download the asset.
 */
export async function getCodeQLAssetDownloadURL(
  action: ActionState<["ReadOnlyEnv", "Logger"]>,
  apiDetails: api.GitHubApiDetails,
  tagName: string,
  assetName: string,
  assetKind: ReleaseAssetKind = "CodeQL bundle",
): Promise<DownloadURL> {
  const codeQLActionRepository = getCodeQLActionRepository(action);

  // We construct the default GitHub.com source here, because `getDotcomApiDetails`
  // may retrieve the `token` input if we are currently running on GitHub.com and
  // we want to avoid doing that statically.
  const defaultDownloadSource: DownloadSource = [
    api.getDotcomApiDetails(action.env),
    CODEQL_DEFAULT_ACTION_REPOSITORY,
  ];

  const potentialDownloadSources: DownloadSource[] = [
    // This GitHub instance, and this Action.
    [apiDetails, codeQLActionRepository],
    // This GitHub instance, and the canonical Action.
    [apiDetails, CODEQL_DEFAULT_ACTION_REPOSITORY],
    // GitHub.com, and the canonical Action.
    defaultDownloadSource,
  ];

  // We now filter out any duplicates.
  // Duplicates will happen either because the GitHub instance is GitHub.com, or because the Action is not a fork.
  const uniqueDownloadSources = potentialDownloadSources.filter(
    (source, index, self) => {
      return !self
        .slice(0, index)
        .some((other) => isSameDownloadSource(source, other));
    },
  );

  for (const [instance, repository] of uniqueDownloadSources) {
    // If we've reached the final case, short-circuit the API check since we know the asset exists and is public.
    if (isSameDownloadSource(defaultDownloadSource, [instance, repository])) {
      break;
    }

    const { owner: repositoryOwner, repo: repositoryName } =
      parseRepositoryNwo(repository);
    try {
      const release = await api
        .getApiClient(action.env, instance)
        .rest.repos.getReleaseByTag({
          owner: repositoryOwner,
          repo: repositoryName,
          tag: tagName,
        });

      for (const asset of release.data.assets) {
        if (asset.name === assetName) {
          action.logger.info(
            `Found ${assetKind} ${assetName} in ${repository} on ${instance.apiURL} with URL ${asset.url}.`,
          );
          return asset.url;
        }
      }
    } catch (e) {
      action.logger.info(
        `Looked for ${assetKind} ${assetName} in ${repository} on ${instance.apiURL} but got error ${e}.`,
      );
    }
  }

  return getDefaultDotcomDownloadURL(tagName, assetName);
}
