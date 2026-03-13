#!/usr/bin/env npx tsx

/** Update the required checks based on the current branch. */

import { parseArgs } from "node:util";

import * as githubUtils from "@actions/github/lib/utils";
import { type Octokit } from "@octokit/core";
import { type PaginateInterface } from "@octokit/plugin-paginate-rest";
import { type Api } from "@octokit/plugin-rest-endpoint-methods";

import { OLDEST_SUPPORTED_MAJOR_VERSION } from "./config";

/** The type of the Octokit client. */
type ApiClient = Octokit & Api & { paginate: PaginateInterface };

/** Constructs an `ApiClient` using `token` for authentication. */
function getApiClient(token: string): ApiClient {
  const opts = githubUtils.getOctokitOptions(token);
  return new githubUtils.GitHub(opts);
}

async function main(): Promise<void> {
  const { values: options } = parseArgs({
    options: {
      // The token to use to authenticate to the API.
      token: {
        type: "string",
      },
      // The git ref for which to retrieve the check runs.
      ref: {
        type: "string",
      },
      // By default, we perform a dry-run. Setting `apply` to `true` actually applies the changes.
      apply: {
        type: "boolean",
        default: false,
      },
    },
    strict: true,
  });

  if (options.token === undefined) {
    throw new Error("Missing --token");
  }
  if (options.ref === undefined) {
    throw new Error("Missing --ref");
  }

  console.info(
    `Oldest supported major version is: ${OLDEST_SUPPORTED_MAJOR_VERSION}`,
  );

  // Initialise the API client.
  const client = getApiClient(options.token);

  process.exit(0);
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
