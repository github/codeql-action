import * as githubUtils from "@actions/github/lib/utils";

/** The type of the Octokit client. */
export type ApiClient = InstanceType<typeof githubUtils.GitHub>;

/** Constructs an `ApiClient` using `token` for authentication. */
export function getApiClient(token: string): ApiClient {
  const opts = githubUtils.getOctokitOptions(token);
  return new githubUtils.GitHub(opts);
}

/** Resolves the GitHub API token to use, from `GH_TOKEN` or `GITHUB_TOKEN`. */
export function resolveToken(env: NodeJS.ProcessEnv): string {
  const token = env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Missing authentication token. Set GH_TOKEN or GITHUB_TOKEN.",
    );
  }
  return token;
}
