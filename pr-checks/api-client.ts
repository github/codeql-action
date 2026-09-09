import * as githubUtils from "@actions/github/lib/utils";

/** The type of the Octokit client. */
export type ApiClient = InstanceType<typeof githubUtils.GitHub>;

/** Constructs an `ApiClient` using `token` for authentication. */
export function getApiClient(token: string): ApiClient {
  const opts = githubUtils.getOctokitOptions(token);
  return new githubUtils.GitHub(opts);
}
