import * as github from "@actions/github";
import consoleLogLevel from "console-log-level";
import * as path from "path";

import { getRequiredEnvParam, getRequiredInput } from "./actions-util";
import { isLocalRun } from "./util";

export const getApiClient = function (
  githubAuth: string,
  githubUrl: string,
  allowLocalRun = false
) {
  if (isLocalRun() && !allowLocalRun) {
    throw new Error("Invalid API call in local run");
  }
  return new github.GitHub({
    auth: githubAuth,
    baseUrl: getApiUrl(githubUrl),
    userAgent: "CodeQL Action",
    log: consoleLogLevel({ level: "debug" }),
  });
};

function getApiUrl(githubUrl: string): string {
  const url = new URL(githubUrl);

  // If we detect this is trying to be to github.com
  // then return with a fixed canonical URL.
  if (url.hostname === "github.com" || url.hostname === "api.github.com") {
    return "https://api.github.com";
  }

  // Add the /api/v3 API prefix
  url.pathname = path.join(url.pathname, "api", "v3");
  return url.toString();
}

// Temporary function to aid in the transition to running on and off of github actions.
// Once all code has been coverted this function should be removed or made canonical
// and called only from the action entrypoints.
export function getActionsApiClient(allowLocalRun = false) {
  return getApiClient(
    getRequiredInput("token"),
    getRequiredEnvParam("GITHUB_SERVER_URL"),
    allowLocalRun
  );
}
