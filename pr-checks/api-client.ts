import { ParseArgsConfig } from "node:util";

import * as githubUtils from "@actions/github/lib/utils";
import { type Octokit } from "@octokit/core";
import { type PaginateInterface } from "@octokit/plugin-paginate-rest";
import { type Api } from "@octokit/plugin-rest-endpoint-methods";

/** The type of the Octokit client. */
export type ApiClient = Octokit & Api & { paginate: PaginateInterface };

/** Constructs an `ApiClient` using `token` for authentication. */
export function getApiClient(token: string): ApiClient {
  const opts = githubUtils.getOctokitOptions(token);
  return new githubUtils.GitHub(opts);
}

export interface TokenOption {
  /** The token to use to authenticate to the GitHub API. */
  token?: string;
}

/** Command-line argument parser settings for the token parameter. */
export const TOKEN_OPTION_CONFIG = {
  // The token to use to authenticate to the API.
  token: {
    type: "string",
  },
} satisfies ParseArgsConfig["options"];
