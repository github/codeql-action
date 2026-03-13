#!/usr/bin/env npx tsx

/** Update the required checks based on the current branch. */

import * as fs from "fs";
import { parseArgs } from "node:util";

import * as githubUtils from "@actions/github/lib/utils";
import { type Octokit } from "@octokit/core";
import { type PaginateInterface } from "@octokit/plugin-paginate-rest";
import { type Api } from "@octokit/plugin-rest-endpoint-methods";
import * as yaml from "yaml";

import { OLDEST_SUPPORTED_MAJOR_VERSION } from "./config";

/** Identifies the CodeQL Action repository. */
const codeqlActionRepo = {
  owner: "github",
  repo: "codeql-action",
};

/** Represents a configuration of which checks should not be set up as required checks. */
interface Exclusions {
  /** A list of strings that, if contained in a check name, are excluded. */
  contains: string[];
  /** A list of check names that are excluded if their name is an exact match. */
  is: string[];
}

/** Loads the configuration for which checks to exclude. */
function loadExclusions(): Exclusions {
  return yaml.parse(fs.readFileSync("excluded.yml", "utf-8")) as Exclusions;
}

/** The type of the Octokit client. */
type ApiClient = Octokit & Api & { paginate: PaginateInterface };

/** Constructs an `ApiClient` using `token` for authentication. */
function getApiClient(token: string): ApiClient {
  const opts = githubUtils.getOctokitOptions(token);
  return new githubUtils.GitHub(opts);
}

/**
 * Represents information about a check run. We track the `app_id` that generated the check,
 * because the API will require it in addition to the name in the future.
 */
interface CheckInfo {
  /** The display name of the check. */
  context: string;
  /** The ID of the app that generated the check. */
  app_id: number;
}

/** Removes entries from `checkInfos` based the configuration. */
export function removeExcluded(
  exclusions: Exclusions,
  checkInfos: CheckInfo[],
): CheckInfo[] {
  console.log(exclusions);

  return checkInfos.filter((checkInfo) => {
    if (exclusions.is.includes(checkInfo.context)) {
      console.info(
        `Excluding '${checkInfo.context}' because it is an exact exclusion.`,
      );
      return false;
    }

    for (const containsStr of exclusions.contains) {
      if (checkInfo.context.includes(containsStr)) {
        console.info(
          `Excluding '${checkInfo.context}' because it contains '${containsStr}'.`,
        );
        return false;
      }
    }

    // Keep.
    return true;
  });
}

/** Gets a list of check run names for `ref`. */
async function getChecksFor(
  client: ApiClient,
  ref: string,
): Promise<CheckInfo[]> {
  console.info(`Getting checks for '${ref}'`);

  const response = await client.paginate(
    "GET /repos/{owner}/{repo}/commits/{ref}/check-runs",
    {
      ...codeqlActionRepo,
      ref,
    },
  );

  if (response.length === 0) {
    throw new Error(`No checks found for '${ref}'.`);
  }

  console.info(`Retrieved ${response.length} check runs.`);

  const notSkipped = response.filter(
    (checkRun) => checkRun.conclusion !== "skipped",
  );
  console.info(`Of those: ${notSkipped.length} were not skipped.`);

  // We use the ID of the app that generated the check run when returned by the API,
  // but default to -1 to tell the API that any check with the given name should be
  // required.
  const checkInfos = notSkipped.map((check) => ({
    context: check.name,
    app_id: check.app?.id || -1,
  }));

  // Load the configuration for which checks to exclude and apply it before
  // returning the checks.
  const exclusions = loadExclusions();
  return removeExcluded(exclusions, checkInfos);
}

/** Gets the current list of release branches. */
async function getReleaseBranches(client: ApiClient): Promise<string[]> {
  const refs = await client.rest.git.listMatchingRefs({
    ...codeqlActionRepo,
    ref: "heads/releases/v",
  });
  return refs.data.map((ref) => ref.ref).sort();
}

/** Sets `checkNames` as required checks for `branch`. */
async function updateBranch(
  client: ApiClient,
  branch: string,
  checkNames: Set<string>,
) {
  // Query the current set of required checks for this branch.
  const currentContexts = await client.rest.repos.getAllStatusCheckContexts({
    ...codeqlActionRepo,
    branch,
  });

  // Identify which required checks we will remove and which ones we will add.
  const currentCheckNames = new Set(currentContexts.data);
  let additions = 0;
  let removals = 0;
  let unchanged = 0;

  for (const currentCheck of currentCheckNames) {
    if (!checkNames.has(currentCheck)) {
      console.info(`- Removing '${currentCheck}' for branch '${branch}'`);
      removals++;
    } else {
      unchanged++;
    }
  }
  for (const newCheck of checkNames) {
    if (!currentCheckNames.has(newCheck)) {
      console.info(`+ Adding '${newCheck}' for branch '${branch}'`);
      additions++;
    }
  }

  console.info(
    `For '${branch}': ${removals} removals; ${additions} additions; ${unchanged} unchanged`,
  );

  // TODO: actually perform the update
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

  // Find the check runs for the specified `ref` that we will later set as the required checks
  // for the main and release branches.
  const checkInfos = await getChecksFor(client, options.ref);
  const checkNames = new Set(checkInfos.map((info) => info.context));

  // Retrieve the refs of the release branches.
  const releaseBranches = await getReleaseBranches(client);
  console.info(
    `Found ${releaseBranches.length} release branches: ${releaseBranches.join(", ")}`,
  );

  for (const releaseBranchRef of releaseBranches) {
    // Sanity check that the ref name is in the expected format and extract the major version.
    const releaseBranchMatch = releaseBranchRef.match(
      /^refs\/heads\/(releases\/v(\d+))/,
    );
    if (!releaseBranchMatch) {
      console.warn(
        `Branch ref '${releaseBranchRef}' not in the expected format.`,
      );
      continue;
    }
    const releaseBranch = releaseBranchMatch[1];
    const releaseBranchMajor = Number.parseInt(releaseBranchMatch[2]);

    // Update the required checks for this major version if it is still supported.
    if (releaseBranchMajor < OLDEST_SUPPORTED_MAJOR_VERSION) {
      console.info(
        `Skipping '${releaseBranch}' since it is older than v${OLDEST_SUPPORTED_MAJOR_VERSION}`,
      );
      continue;
    } else {
      console.info(`Updating '${releaseBranch}'...`);
      await updateBranch(client, releaseBranch, checkNames);
    }
  }

  process.exit(0);
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
