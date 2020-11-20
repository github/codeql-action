import * as path from "path";

import { exportVariable } from "@actions/core";
import * as githubUtils from "@actions/github/lib/utils";
import * as retry from "@octokit/plugin-retry";
import { OctokitResponse } from "@octokit/types";
import consoleLogLevel from "console-log-level";
import * as semver from "semver";

import { getRequiredEnvParam, getRequiredInput } from "./actions-util";
import * as apiCompatibility from "./api-compatibility.json";
import { Logger, getActionsLogger } from "./logging";
import { isLocalRun, Mode } from "./util";

export enum DisallowedAPIVersionReason {
  ACTION_TOO_OLD,
  ACTION_TOO_NEW,
}

const GITHUB_ENTERPRISE_VERSION_HEADER = "x-github-enterprise-version";
const CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR =
  "CODEQL_ACTION_WARNED_ABOUT_VERSION";
let hasBeenWarnedAboutVersion = false;

export const getApiClient = function (
  githubAuth: string,
  githubUrl: string,
  mode: Mode,
  logger: Logger,
  allowLocalRun = false,
  possibleFailureExpected = false
) {
  if (isLocalRun() && !allowLocalRun) {
    throw new Error("Invalid API call in local run");
  }
  const customOctokit = githubUtils.GitHub.plugin(retry.retry, (octokit, _) => {
    octokit.hook.after("request", (response: OctokitResponse<any>, __) => {
      if (response.status < 400 && !possibleFailureExpected) {
        if (hasBeenWarnedAboutVersion) {
          return;
        }
      }
      if (
        response.headers[GITHUB_ENTERPRISE_VERSION_HEADER] === undefined ||
        process.env[CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR] === undefined
      ) {
        return;
      }
      const installedVersion = response.headers[
        GITHUB_ENTERPRISE_VERSION_HEADER
      ] as string;
      const disallowedAPIVersionReason = apiVersionInRange(
        installedVersion,
        apiCompatibility.minimumVersion,
        apiCompatibility.maximumVersion
      );

      const toolName = mode === "actions" ? "Action" : "Runner";

      if (
        disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_OLD
      ) {
        logger.warning(
          `The CodeQL ${toolName} version you are using is too old to be compatible with GitHub Enterprise ${installedVersion}. If you experience issues, please upgrade to a more recent version of the CodeQL ${toolName}.`
        );
      }
      if (
        disallowedAPIVersionReason === DisallowedAPIVersionReason.ACTION_TOO_NEW
      ) {
        logger.warning(
          `GitHub Enterprise ${installedVersion} is too old to be compatible with this version of the CodeQL ${toolName}. If you experience issues, please upgrade to a more recent version of GitHub Enterprise or use an older version of the CodeQL ${toolName}.`
        );
      }
      hasBeenWarnedAboutVersion = true;
      if (mode === "actions") {
        exportVariable(CODEQL_ACTION_WARNED_ABOUT_VERSION_ENV_VAR, true);
      }
    });
  });
  return new customOctokit(
    githubUtils.getOctokitOptions(githubAuth, {
      baseUrl: getApiUrl(githubUrl),
      userAgent: "CodeQL Action",
      log: consoleLogLevel({ level: "debug" }),
    })
  );
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
// Once all code has been converted this function should be removed or made canonical
// and called only from the action entrypoints.
export function getActionsApiClient(allowLocalRun = false) {
  return getApiClient(
    getRequiredInput("token"),
    getRequiredEnvParam("GITHUB_SERVER_URL"),
    "actions",
    getActionsLogger(),
    allowLocalRun
  );
}

export function apiVersionInRange(
  version: string,
  minimumVersion: string,
  maximumVersion: string
): DisallowedAPIVersionReason | undefined {
  if (!semver.satisfies(version, `>=${minimumVersion}`)) {
    return DisallowedAPIVersionReason.ACTION_TOO_NEW;
  }
  if (!semver.satisfies(version, `<=${maximumVersion}`)) {
    return DisallowedAPIVersionReason.ACTION_TOO_OLD;
  }
  return undefined;
}
