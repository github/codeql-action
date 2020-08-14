import * as core from "@actions/core";
import * as github from "@actions/github";
import consoleLogLevel from "console-log-level";

import { getRequiredEnvParam, isLocalRun } from "./util";

export const getApiClient = function(githubAuth: string, githubApiUrl: string, allowLocalRun = false) {
  if (isLocalRun() && !allowLocalRun) {
    throw new Error('Invalid API call in local run');
  }
  return new github.GitHub(
    {
      auth: parseAuth(githubAuth),
      baseUrl: githubApiUrl,
      userAgent: "CodeQL Action",
      log: consoleLogLevel({ level: "debug" })
    });
};

// Parses the user input as either a single token,
// or a username and password / PAT.
function parseAuth(auth: string): string {
  // Check if it's a username:password pair
  const c = auth.indexOf(':');
  if (c !== -1) {
    return 'basic ' + Buffer.from(auth).toString('base64');
  }

  // Otherwise use the token as it is
  return auth;
}

// Temporary function to aid in the transition to running on and off of github actions.
// Once all code has been coverted this function should be removed or made canonical
// and called only from the action entrypoints.
export function getActionsApiClient(allowLocalRun = false) {
  return getApiClient(
    core.getInput('token'),
    getRequiredEnvParam('GITHUB_API_URL'),
    allowLocalRun);
}
