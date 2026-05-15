#!/usr/bin/env npx tsx

/** Update the required checks based on the current branch. */

import * as fs from "fs";
import { parseArgs } from "node:util";

import * as yaml from "yaml";

import { type ApiClient, getApiClient } from "./api-client";
import {
  OLDEST_SUPPORTED_MAJOR_VERSION,
  PR_CHECK_EXCLUDED_FILE,
} from "./config";

/** Represents the command-line options. */
export interface Options {
  /** Whether to read the GitHub API token from standard input. */
  tokenStdin?: boolean;
  /** The git ref to use the checks for. */
  ref?: string;
  /** Whether to actually apply the changes or not. */
  apply: boolean;
  /** Whether to output additional information. */
  verbose: boolean;
}

/** Identifies the CodeQL Action repository. */
const codeqlActionRepo = {
  owner: "github",
  repo: "codeql-action",
};

/** Environment variables to check for a GitHub API token. */
const TOKEN_ENVIRONMENT_VARIABLES = ["GH_TOKEN", "GITHUB_TOKEN"];

/** Represents the sources from which we can retrieve the GitHub API token. */
interface TokenSource {
  /** Environment variables to inspect. */
  env: NodeJS.ProcessEnv;
  /** Reads a token from standard input. */
  readStdin: () => Promise<string>;
}

/** Reads the GitHub API token from standard input. */
async function readTokenFromStdin(): Promise<string> {
  let token = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    token += chunk;
  }
  return token.trim();
}

/** Gets a GitHub API token from one of the supported environment variables. */
function getTokenFromEnvironment(env: NodeJS.ProcessEnv): string | undefined {
  for (const variableName of TOKEN_ENVIRONMENT_VARIABLES) {
    const token = env[variableName]?.trim();
    if (token) {
      return token;
    }
  }
  return undefined;
}

/** Gets the token to use to authenticate to the GitHub API. */
export async function resolveToken(
  options: Pick<Options, "tokenStdin">,
  tokenSource: TokenSource = {
    env: process.env,
    readStdin: readTokenFromStdin,
  },
): Promise<string> {
  if (options.tokenStdin) {
    const token = (await tokenSource.readStdin()).trim();
    if (token.length === 0) {
      throw new Error("No token received on standard input.");
    }
    return token;
  }

  const environmentToken = getTokenFromEnvironment(tokenSource.env);
  if (environmentToken !== undefined) {
    return environmentToken;
  }

  throw new Error(
    "Missing authentication token. Set GH_TOKEN/GITHUB_TOKEN or pipe a token " +
      "to --token-stdin.",
  );
}

/** Represents a configuration of which checks should not be set up as required checks. */
export interface Exclusions {
  /** A list of strings that, if contained in a check name, are excluded. */
  contains: string[];
  /** A list of check names that are excluded if their name is an exact match. */
  is: string[];
}

/** Loads the configuration for which checks to exclude. */
function loadExclusions(): Exclusions {
  return yaml.parse(
    fs.readFileSync(PR_CHECK_EXCLUDED_FILE, "utf-8"),
  ) as Exclusions;
}

/**
 * Represents information about a check run. We track the `app_id` that generated the check,
 * because the API will require it in addition to the name in the future.
 */
export interface CheckInfo {
  /** The display name of the check. */
  context: string;
  /** The ID of the app that generated the check. */
  app_id: number;
}

/** Removes entries from `checkInfos` based on the configuration. */
export function removeExcluded(
  options: Options,
  exclusions: Exclusions,
  checkInfos: CheckInfo[],
): CheckInfo[] {
  if (options.verbose) {
    console.log(exclusions);
  }

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
  options: Options,
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
  return removeExcluded(options, exclusions, checkInfos);
}

/** Gets the current list of release branches. */
async function getReleaseBranches(client: ApiClient): Promise<string[]> {
  const refs = await client.rest.git.listMatchingRefs({
    ...codeqlActionRepo,
    ref: "heads/releases/v",
  });
  return refs.data.map((ref) => ref.ref).sort();
}

/** Updates the required status checks for `branch` to `checks`. */
async function patchBranchProtectionRule(
  client: ApiClient,
  branch: string,
  checks: Set<string>,
) {
  await client.rest.repos.setStatusCheckContexts({
    ...codeqlActionRepo,
    branch,
    contexts: Array.from(checks),
  });
}

/** Sets `checkNames` as required checks for `branch`. */
async function updateBranch(
  options: Options,
  client: ApiClient,
  branch: string,
  checkNames: Set<string>,
) {
  console.info(`Updating '${branch}'...`);

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

  // Perform the update if there are changes and `--apply` was specified.
  if (unchanged === checkNames.size && removals === 0 && additions === 0) {
    console.info("Not applying changes because there is nothing to do.");
  } else if (options.apply) {
    await patchBranchProtectionRule(client, branch, checkNames);
  } else {
    console.info("Not applying changes because `--apply` was not specified.");
  }
}

async function main(): Promise<void> {
  const { values: options } = parseArgs({
    options: {
      // Read the token to use to authenticate to the API from standard input.
      "token-stdin": {
        type: "boolean",
        default: false,
      },
      // The git ref for which to retrieve the check runs.
      ref: {
        type: "string",
        default: "main",
      },
      // By default, we perform a dry-run. Setting `apply` to `true` actually applies the changes.
      apply: {
        type: "boolean",
        default: false,
      },
      // Whether to output additional information.
      verbose: {
        type: "boolean",
        default: false,
      },
    },
    strict: true,
  });

  const token = await resolveToken({
    tokenStdin: options["token-stdin"],
  });

  console.info(
    `Oldest supported major version is: ${OLDEST_SUPPORTED_MAJOR_VERSION}`,
  );

  // Initialise the API client.
  const client = getApiClient(token);

  // Find the check runs for the specified `ref` that we will later set as the required checks
  // for the main and release branches.
  const checkInfos = await getChecksFor(options, client, options.ref);
  const checkNames = new Set(checkInfos.map((info) => info.context));

  // Update the main branch.
  await updateBranch(options, client, "main", checkNames);

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
      await updateBranch(options, client, releaseBranch, checkNames);
    }
  }

  process.exit(0);
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
