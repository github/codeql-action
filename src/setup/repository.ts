import { ActionState } from "../action-common";
import { isRunningLocalAction } from "../actions-util";
import * as api from "../api-client";
import { ActionsEnvVars } from "../environment";
import { GITHUB_DOTCOM_URL } from "../util";

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
): string {
  if (isRunningLocalAction(action.env)) {
    // This handles the case where the Action does not come from an Action repository,
    // e.g. our integration tests which use the Action code from the current checkout.
    // In these cases, the GITHUB_ACTION_REPOSITORY environment variable is not set.
    action.logger.info(
      "The CodeQL Action is checked out locally. Using the default CodeQL Action repository.",
    );
    return CODEQL_DEFAULT_ACTION_REPOSITORY;
  }

  return action.env.getRequired(ActionsEnvVars.GITHUB_ACTION_REPOSITORY);
}

/**A download source is a pair of strings. */
export type DownloadSource = [string, string];

/** GitHub.com, and the canonical Action. */
export const DEFAULT_DOWNLOAD_SOURCE: DownloadSource = [
  GITHUB_DOTCOM_URL,
  CODEQL_DEFAULT_ACTION_REPOSITORY,
];

/** Decides if the two provided download sources are the same. */
const isSameDownloadSource = (
  [srcUrl, srcRepo]: DownloadSource,
  [otherUrl, otherRepo]: DownloadSource,
) => {
  return srcUrl === otherUrl && srcRepo === otherRepo;
};

/** A download URL is represented as a string. */
export type DownloadURL = string;

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
  assetKind: "CodeQL bundle" = "CodeQL bundle",
): Promise<DownloadURL> {
  const codeQLActionRepository = getCodeQLActionRepository(action);

  const potentialDownloadSources: Array<[string, string]> = [
    // This GitHub instance, and this Action.
    [apiDetails.url, codeQLActionRepository],
    // This GitHub instance, and the canonical Action.
    [apiDetails.url, CODEQL_DEFAULT_ACTION_REPOSITORY],
    // GitHub.com, and the canonical Action.
    DEFAULT_DOWNLOAD_SOURCE,
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

  for (const [apiURL, repository] of uniqueDownloadSources) {
    // If we've reached the final case, short-circuit the API check since we know the bundle exists and is public.
    if (isSameDownloadSource(DEFAULT_DOWNLOAD_SOURCE, [apiURL, repository])) {
      break;
    }

    const [repositoryOwner, repositoryName] = repository.split("/");
    try {
      const release = await api.getApiClient().rest.repos.getReleaseByTag({
        owner: repositoryOwner,
        repo: repositoryName,
        tag: tagName,
      });

      for (const asset of release.data.assets) {
        if (asset.name === assetName) {
          action.logger.info(
            `Found ${assetKind} ${assetName} in ${repository} on ${apiURL} with URL ${asset.url}.`,
          );
          return asset.url;
        }
      }
    } catch (e) {
      action.logger.info(
        `Looked for ${assetKind} ${assetName} in ${repository} on ${apiURL} but got error ${e}.`,
      );
    }
  }

  return `https://github.com/${CODEQL_DEFAULT_ACTION_REPOSITORY}/releases/download/${tagName}/${assetName}`;
}
