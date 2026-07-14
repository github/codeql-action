#!/usr/bin/env npx tsx

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import * as fs from "node:fs";
import { parseArgs } from "node:util";

import { type ApiClient, getApiClient } from "./api-client";
import { PACKAGE_JSON } from "./config";

/** Placeholder changelog content for a new release. */
const EMPTY_CHANGELOG = `# CodeQL Action Changelog

## [UNRELEASED]

No user facing changes.

`;

/**
 * NB: This exact commit message is used to find commits for reverting during backports.
 *  Changing it requires a transition period where both old and new versions are supported.
 */
export const BACKPORT_COMMIT_MESSAGE = "Update version and changelog for v";

/**
 * Commit message used for rebuild commits, both those produced by this script and those produced
 *  by the `Rebuild Action` workflow (`.github/workflows/rebuild.yml`).
 */
export const REBUILD_COMMIT_MESSAGE = "Rebuild";

/** The name of the git remote. */
const ORIGIN = "origin";

/** Environment variables checked (in order) for a GitHub API token. */
const TOKEN_ENVIRONMENT_VARIABLES = ["GH_TOKEN", "GITHUB_TOKEN"] as const;

/** The expected prefix for release branch names. */
const RELEASE_BRANCH_PREFIX = "releases/v";

/**
 * Gets a GitHub API token from one of the supported environment variables.
 * @throws If none of the supported environment variables is set.
 */
export function getGitHubToken(): string {
  for (const name of TOKEN_ENVIRONMENT_VARIABLES) {
    const token = process.env[name]?.trim();
    if (token) {
      return token;
    }
  }
  throw new Error("Missing GitHub token. Set GITHUB_TOKEN or GH_TOKEN.");
}

/** Options for {@link runGit}. */
interface RunGitOptions {
  /** When true, non-zero exit codes will not throw. */
  allowNonZeroExitCode?: boolean;
  /** A value indicating whether to just log the command, rather than run it. */
  dryRun?: boolean;
}

/**
 * Runs `git` with the given `args` and returns the stdout.
 *
 * @param args - Arguments to pass to `git`.
 * @param options - Optional settings.
 * @throws If `git` does not exit successfully, unless
 *         `options.allowNonZeroExitCode` is `true`.
 * @returns The trimmed stdout output.
 */
export function runGit(args: string[], options?: RunGitOptions): string {
  const execOptions: ExecFileSyncOptions = {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  };

  try {
    if (!options?.dryRun) {
      const result = execFileSync("git", args, execOptions) as string;
      return result.trimEnd();
    } else {
      console.info(`[DRY RUN] Would have executed 'git ${args.join(" ")}'`);
      return "";
    }
  } catch (error: unknown) {
    if (options?.allowNonZeroExitCode) {
      // execFileSync throws an object with `stdout` when the process exits
      // with a non-zero code.
      const execError = error as { stdout?: Buffer | string };
      if (typeof execError.stdout === "string") {
        return execError.stdout.trimEnd();
      }
      if (Buffer.isBuffer(execError.stdout)) {
        return execError.stdout.toString("utf8").trimEnd();
      }
      return "";
    }
    throw error;
  }
}

/** Returns true if the given branch exists on the origin remote. */
export function branchExistsOnRemote(branchName: string): boolean {
  const result = runGit(["ls-remote", "--heads", ORIGIN, branchName]);
  return result !== "";
}

/** Reads the current version from `package.json`. */
export function getCurrentVersion(): string | undefined {
  const pkg: { version: string } = JSON.parse(
    fs.readFileSync(PACKAGE_JSON, "utf8"),
  );
  return pkg.version;
}

/** Represents commits returned by the GitHub API (relevant fields only). */
export interface GitHubCommit {
  sha: string;
  commit: { message: string; author: { date?: string } | null };
  author: { login: string } | null;
  committer: { login: string } | null;
  parents: Array<{ sha: string }>;
}

/** Returns true if the commit is an automatic PR merge commit made by GitHub. */
export function isPrMergeCommit(commit: GitHubCommit): boolean {
  return commit.committer?.login === "web-flow" && commit.parents.length > 1;
}

/**
 * Gets a list of commits on the source branch that are not on the target branch,
 * excluding automatic PR merge commits.
 *
 * Uses `git log` to find the SHAs, then fetches each commit from the GitHub API
 * to obtain full metadata (author, parents, associated PRs, etc.).
 *
 * @param client - An authenticated GitHub API client.
 * @param owner - The repository owner.
 * @param repo - The repository name.
 * @param sourceBranch - The source branch name (without `origin/` prefix).
 * @param targetBranch - The target branch name (without `origin/` prefix).
 * @returns The list of non-merge commits unique to the source branch.
 */
export async function getCommitDifference(
  client: ApiClient,
  owner: string,
  repo: string,
  sourceBranch: string,
  targetBranch: string,
): Promise<GitHubCommit[]> {
  const logOutput = runGit([
    "log",
    "--pretty=format:%H",
    `${ORIGIN}/${targetBranch}..${ORIGIN}/${sourceBranch}`,
  ]);

  // An empty log output means no commits to merge.
  if (logOutput === "") {
    return [];
  }

  const shas = logOutput.split("\n");

  // Fetch full commit objects from the API.
  console.info(
    `Fetching information about ${shas.length} commits from the API...`,
  );

  const commits: GitHubCommit[] = [];
  for (const sha of shas) {
    const { data } = await client.rest.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });
    commits.push(data as GitHubCommit);
  }

  // Filter out automatic PR merge commits.
  return commits.filter((c) => !isPrMergeCommit(c));
}

interface MainOptions {
  dryRun: boolean;
  repositoryNwo: string;
  sourceBranch: string;
  targetBranch: string;
  isPrimaryRelease: boolean;
  conductor: string;
}

function parseCliOptions(): MainOptions {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      "repository-nwo": { type: "string" },
      "source-branch": { type: "string" },
      "target-branch": { type: "string" },
      "is-primary-release": { type: "boolean", default: false },
      conductor: { type: "string" },
    },
    strict: true,
  });

  if (!values["repository-nwo"]) {
    throw new Error("--repository-nwo is required");
  }
  if (!values["source-branch"]) {
    throw new Error("--source-branch is required");
  }
  if (!values["target-branch"]) {
    throw new Error("--target-branch is required");
  }
  if (!values["conductor"]) {
    throw new Error("--conductor is required");
  }

  return {
    dryRun: values["dry-run"],
    repositoryNwo: values["repository-nwo"],
    sourceBranch: values["source-branch"],
    targetBranch: values["target-branch"],
    isPrimaryRelease: values["is-primary-release"] ?? false,
    conductor: values["conductor"],
  };
}

async function main(): Promise<void> {
  const options = parseCliOptions();
  const token = getGitHubToken();
  const client = getApiClient(token);

  if (!options.targetBranch.startsWith(RELEASE_BRANCH_PREFIX)) {
    throw new Error(
      `Expected target branch to start with '${RELEASE_BRANCH_PREFIX}', but got '${options.targetBranch}'.`,
    );
  }
  if (!options.repositoryNwo.includes("/")) {
    throw new Error(
      `Expected repository name with owner in 'owner/repo' format, but got '${options.repositoryNwo}'`,
    );
  }

  const targetBranchMajorVersion = options.targetBranch.replace(
    RELEASE_BRANCH_PREFIX,
    "",
  );

  const currentVersion = getCurrentVersion();

  if (!currentVersion) {
    throw new Error("Failed to read current version from package.json");
  }

  const [, vMinor, vPatch] = currentVersion.split(".");
  const version = `${targetBranchMajorVersion}.${vMinor}.${vPatch}`;

  console.log(
    `Considering difference between ${options.sourceBranch} and ${options.targetBranch}...`,
  );

  const sourceBranchShortSha = runGit([
    "rev-parse",
    "--short",
    `${ORIGIN}/${options.sourceBranch}`,
  ]);
  console.log(
    `Current head of ${options.sourceBranch} is ${sourceBranchShortSha}.`,
  );

  const [owner, repo] = options.repositoryNwo.split("/");
  const commits = await getCommitDifference(
    client,
    owner,
    repo,
    options.sourceBranch,
    options.targetBranch,
  );

  if (commits.length === 0) {
    console.log(
      `No commits to merge from ${options.sourceBranch} to ${options.targetBranch}.`,
    );
    return;
  }

  // Use a distinct branch prefix to support specific PR checks on backports.
  const branchPrefix = options.isPrimaryRelease ? "update" : "backport";

  // The branch name is based on the target version and the SHA of the source
  // branch head. If the branch already exists we can assume this script has
  // already run for this combination.
  const newBranchName = `${branchPrefix}-v${version}-${sourceBranchShortSha}`;
  console.log(`Branch name is '${newBranchName}'.`);

  // Check if the branch already exists. If so we can abort as this script
  // has already run on this combination of branches.
  if (branchExistsOnRemote(newBranchName)) {
    console.log(`Branch '${newBranchName}' already exists. Nothing to do.`);
    return;
  }

  // Push the new branch to the remote.
  console.log(`Creating branch ${newBranchName}.`);
  runGit(["push", ORIGIN, newBranchName], { dryRun: options.dryRun });
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
