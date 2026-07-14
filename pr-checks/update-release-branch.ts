#!/usr/bin/env npx tsx

/**
 * Creates a release preparation branch and opens a PR to merge changes from a
 * source branch into a target release branch.
 *
 * For primary releases this merges `main` into the latest `releases/vN` branch.
 * For backports this merges a newer release branch into an older one, handling
 * version number and changelog migration automatically.
 *
 * Usage:
 *   update-release-branch.ts \
 *     --repository-nwo github/codeql-action \
 *     --source-branch main \
 *     --target-branch releases/v4 \
 *     --conductor username \
 *     [--is-primary-release] \
 *     [--dry-run]
 */

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { parseArgs } from "node:util";

import { type ApiClient, getApiClient } from "./api-client";
import * as changelog from "./changelog";
import { DryRunOption, REPO_ROOT } from "./config";
import {
  getCurrentVersion,
  replaceVersionInPackageJson,
  withPackageJson,
} from "./versions";

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

/** Options for {@link runCommand}. */
export interface RunCommandOptions extends DryRunOption {
  /** Options for `execFileSync`. */
  execOptions?: ExecFileSyncOptions;
}

/**
 * Runs a command, streaming output to the console by default.
 *
 * @param command The name of the command to run.
 * @param args The arguments for the command.
 * @throws When the process exits with a non-zero exit code.
 * @param options How to run the command.
 */
export function runCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
) {
  if (!options?.dryRun) {
    console.log(`Running \`${command} ${args.join(" ")}\`.`);
    return execFileSync(command, args, {
      stdio: "inherit",
      cwd: REPO_ROOT,
      ...options?.execOptions,
    });
  } else {
    console.info(
      `[DRY RUN] Would have executed '${command} ${args.join(" ")}'`,
    );
    return "";
  }
}

/** Options for {@link runGit}. */
export interface RunGitOptions extends DryRunOption {
  /** When true, non-zero exit codes will not throw. */
  allowNonZeroExitCode?: boolean;
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
    const result = runCommand("git", args, {
      dryRun: options?.dryRun,
      execOptions,
    }) as string;
    return result.trimEnd();
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
 * excluding automatic PR merge commits. This will not include any commits that
 * exist on the target branch that aren't on the source branch.
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

/** Truncates a commit message for display. */
export function getTruncatedCommitMessage(message: string): string {
  const firstLine = message.split("\n")[0];
  if (firstLine.length > 60) {
    return `${firstLine.slice(0, 57)}...`;
  }
  return firstLine;
}

/** Represents pull requests associated with a commit (relevant fields only). */
export interface AssociatedPullRequest {
  number: number;
  user: { login: string; site_admin: boolean } | null;
  merge_commit_sha: string | null;
}

/**
 * Gets the pull request that introduced a commit to the source branch.
 * Returns the earliest PR by number if multiple are associated.
 */
export async function getPrForCommit(
  client: ApiClient,
  owner: string,
  repo: string,
  commit: GitHubCommit,
): Promise<AssociatedPullRequest | undefined> {
  const { data: prs } =
    await client.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: commit.sha,
    });

  if (prs.length === 0) {
    return undefined;
  }

  // Return the earliest PR by number.
  const sorted = [...prs].sort((a, b) => a.number - b.number);
  return sorted[0];
}

/**
 * Get the login of the person who merged a pull request.
 * Falls back to the commit author of the merge commit.
 * For most cases this will be the same as the author, but for PRs opened
 * by external contributors getting the merger will get us the GitHub
 * employee who reviewed and merged the PR.
 */
export async function getMergerOfPr(
  client: ApiClient,
  owner: string,
  repo: string,
  pr: AssociatedPullRequest,
): Promise<string> {
  if (!pr.merge_commit_sha) {
    return "unknown";
  }
  const { data: commit } = await client.rest.repos.getCommit({
    owner,
    repo,
    ref: pr.merge_commit_sha,
  });
  return commit.author?.login ?? "unknown";
}

/**
 * Returns the PR author's login if they are GitHub staff (site_admin),
 * otherwise undefined.
 */
export function getPrAuthorIfStaff(
  pr: AssociatedPullRequest,
): string | undefined {
  if (pr.user?.site_admin) {
    return pr.user.login;
  }
  return undefined;
}

/** Parameters for {@link openPr}. */
interface OpenPrParams {
  client: ApiClient;
  owner: string;
  repo: string;
  commits: GitHubCommit[];
  sourceBranchShortSha: string;
  newBranchName: string;
  sourceBranch: string;
  targetBranch: string;
  conductor: string;
  isPrimaryRelease: boolean;
  conflictedFiles: string[];
  dryRun: boolean;
}

/**
 * Opens a pull request from the new branch to the target branch and assigns
 * the conductor.
 */
export async function openPr(params: OpenPrParams): Promise<void> {
  const {
    client,
    owner,
    repo,
    commits,
    sourceBranchShortSha,
    newBranchName,
    sourceBranch,
    targetBranch,
    conductor,
    isPrimaryRelease,
    conflictedFiles,
    dryRun,
  } = params;

  // Sort the commits into those with and without associated PRs.
  const pullRequests: AssociatedPullRequest[] = [];
  const commitsWithoutPrs: GitHubCommit[] = [];

  console.info(`Finding PRs for ${commits.length} commits...`);

  for (const commit of commits) {
    const pr = await getPrForCommit(client, owner, repo, commit);
    if (!pr) {
      commitsWithoutPrs.push(commit);
    } else if (!pullRequests.some((p) => p.number === pr.number)) {
      pullRequests.push(pr);
    }
  }

  console.log(`Found ${pullRequests.length} pull requests.`);
  console.log(
    `Found ${commitsWithoutPrs.length} commits not in a pull request.`,
  );

  // Sort PRs by number (ascending) and commits by date.
  pullRequests.sort((a, b) => a.number - b.number);
  commitsWithoutPrs.sort((a, b) => {
    const dateA = a.commit.author?.date ?? "";
    const dateB = b.commit.author?.date ?? "";
    return dateA.localeCompare(dateB);
  });

  // Build the PR body.
  const body: string[] = [];
  body.push(`Merging ${sourceBranchShortSha} into \`${targetBranch}\`.`);
  body.push("");
  body.push(`Conductor for this PR is @${conductor}.`);

  if (pullRequests.length > 0) {
    body.push("");
    body.push("Contains the following pull requests:");
    for (const pr of pullRequests) {
      const displayUser =
        getPrAuthorIfStaff(pr) ??
        (await getMergerOfPr(client, owner, repo, pr));
      body.push(`- #${pr.number} (@${displayUser})`);
    }
  }

  if (commitsWithoutPrs.length > 0) {
    body.push("");
    body.push("Contains the following commits not from a pull request:");
    for (const commit of commitsWithoutPrs) {
      const authorDesc = commit.author ? ` (@${commit.author.login})` : "";
      body.push(
        `- ${commit.sha} - ${getTruncatedCommitMessage(commit.commit.message)}${authorDesc}`,
      );
    }
  }

  body.push("");
  body.push("Please do the following:");
  if (conflictedFiles.length > 0) {
    body.push(
      " - [ ] Ensure `package.json` file contains the correct version.",
    );
    body.push(
      " - [ ] Add a commit to this branch to resolve the merge conflicts in the following files:",
    );
    for (const file of conflictedFiles) {
      body.push(`    - \`${file}\``);
    }
    body.push(
      ` - [ ] Rebuild the Action locally (\`npm run build\`) and push any changes to the built output in \`lib\` as a separate commit named exactly \`${REBUILD_COMMIT_MESSAGE}\`.`,
    );
    body.push(
      " - [ ] Ensure another maintainer has reviewed the additional commits you added to this branch to resolve the merge conflicts.",
    );
  }
  body.push(
    " - [ ] Ensure the CHANGELOG displays the correct version and date.",
  );
  body.push(
    " - [ ] Ensure the CHANGELOG includes all relevant, user-facing changes since the last release.",
  );
  body.push(
    ` - [ ] Check that there are not any unexpected commits being merged into the \`${targetBranch}\` branch.`,
  );
  body.push(
    " - [ ] Ensure the docs team is aware of any documentation changes that need to be released.",
  );
  body.push(
    " - [ ] Approve running the full set of PR checks if you have not pushed any changes.",
  );
  body.push(
    " - [ ] Approve and merge this PR. Make sure `Create a merge commit` is selected rather than `Squash and merge` or `Rebase and merge`.",
  );

  if (isPrimaryRelease) {
    body.push(
      " - [ ] Merge the mergeback PR that will automatically be created once this PR is merged.",
    );
    body.push(
      " - [ ] Merge all backport PRs to older release branches, that will automatically be created once this PR is merged.",
    );
  }

  const title = `Merge ${sourceBranch} into ${targetBranch}`;

  if (dryRun) {
    console.info(`[DRY RUN] Would create PR: "${title}" with body:`);

    for (const line of body) {
      console.info(`[DRY RUN] > ${line}`);
    }

    console.info(`[DRY RUN] and assign it to @${conductor}`);

    return;
  }

  // Create the pull request.
  const { data: pr } = await client.rest.pulls.create({
    owner,
    repo,
    title,
    body: body.join("\n"),
    head: newBranchName,
    base: targetBranch,
  });
  console.log(`Created PR #${pr.number}`);

  // Assign the conductor.
  await client.rest.issues.addAssignees({
    owner,
    repo,
    issue_number: pr.number,
    assignees: [conductor],
  });
  console.log(`Assigned PR to ${conductor}`);
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

/**
 * Rebuilds the action (npm ci + npm run build) and commits any changes.
 */
export function rebuildAction(options: MainOptions): void {
  // For backports, the only source-level change vs the source branch is the new version number,
  // so we just need to refresh the version embedded in `lib/`.
  runCommand("npm", ["ci"]);
  runCommand("npm", ["run", "build"]);

  runGit(["add", "--all"], { dryRun: options.dryRun });

  // `git diff --cached --quiet` exits 0 if there are no staged changes.
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"]);
    console.log("Rebuild produced no changes; skipping Rebuild commit.");
  } catch {
    runGit(["commit", "-m", REBUILD_COMMIT_MESSAGE], {
      dryRun: options.dryRun,
    });
    console.log("Created Rebuild commit.");
  }
}

/**
 * Prepares the new update/backport branch.
 *
 * @param options The options we are running with.
 * @param newBranchName The name of the new branch to create.
 * @param targetBranchMajorVersion The target branch's major version.
 * @param version The target version.
 */
export async function prepareNewBranch(
  options: MainOptions,
  newBranchName: string,
  targetBranchMajorVersion: string,
  version: string,
): Promise<string[]> {
  // The process of creating the v{Older} release can run into merge conflicts. We commit the unresolved
  // conflicts so a maintainer can easily resolve them (vs erroring and requiring maintainers to
  // reconstruct the release manually)
  let conflictedFiles: string[] = [];

  if (!options.isPrimaryRelease) {
    // For backports, the source branch is also a release branch.
    const sourceBranchMajorVersion = options.sourceBranch.replace(
      RELEASE_BRANCH_PREFIX,
      "",
    );

    // Start from the target branch.
    console.log(
      `Creating ${newBranchName} from the ${ORIGIN}/${options.targetBranch} branch`,
    );

    runGit(
      ["checkout", "-b", newBranchName, `${ORIGIN}/${options.targetBranch}`],
      { dryRun: options.dryRun },
    );

    // Revert the commit that we made as part of the last release that updated the version number and
    // changelog to refer to {older}.x.x variants. This avoids merge conflicts in the changelog and
    // package.json files when we merge in the v{latest} branch.
    // This commit will not exist the first time we release the v{N-1} branch from the v{N} branch, so we
    // use `git log --grep` to conditionally revert the commit.
    console.log(
      "Reverting the version number and changelog updates from the last release to avoid conflicts",
    );
    const vOlderUpdateCommits = runGit([
      "log",
      "--grep",
      `^${BACKPORT_COMMIT_MESSAGE}`,
      "--format=%H",
    ])
      .split("\n")
      .filter((s) => s !== "");

    if (vOlderUpdateCommits.length > 0) {
      // Only revert the newest commit as older ones will already have been
      // reverted in previous releases.
      console.log(`  Reverting ${vOlderUpdateCommits[0]}`);
      runGit(["revert", vOlderUpdateCommits[0], "--no-edit"], {
        dryRun: options.dryRun,
      });

      // Also revert the "Rebuild" commit, whether created by this script or
      // by the `Rebuild Action` workflow.
      const rebuildCommits = runGit([
        "log",
        "--grep",
        `^${REBUILD_COMMIT_MESSAGE}$`,
        "--format=%H",
      ])
        .split("\n")
        .filter((s) => s !== "");
      const rebuildCommit = rebuildCommits[0];
      console.log(`  Reverting ${rebuildCommit}`);
      runGit(["revert", rebuildCommit, "--no-edit"], {
        dryRun: options.dryRun,
      });
    } else {
      console.log("  Nothing to revert.");
    }

    // Merge the source branch into the release prep branch.
    console.log(
      `Merging ${ORIGIN}/${options.sourceBranch} into the release prep branch`,
    );
    runGit(["merge", `${ORIGIN}/${options.sourceBranch}`], {
      allowNonZeroExitCode: true,
      dryRun: options.dryRun,
    });
    conflictedFiles = runGit(["diff", "--name-only", "--diff-filter", "U"])
      .split("\n")
      .filter((s) => s !== "");
    if (conflictedFiles.length > 0) {
      runGit(["add", "."], {
        dryRun: options.dryRun,
      });
      runGit(["commit", "--no-edit"], {
        dryRun: options.dryRun,
      });
    }

    // Migrate the package version number.
    console.log(`Setting version number to '${version}' in package.json`);
    withPackageJson((content) => {
      const currentPkgVersion = getCurrentVersion(content);
      if (currentPkgVersion) {
        return {
          content: replaceVersionInPackageJson(
            currentPkgVersion,
            version,
            content,
          ),
          value: currentPkgVersion,
        };
      }
      return { value: currentPkgVersion };
    }, options);
    runGit(["add", "package.json"], {
      dryRun: options.dryRun,
    });

    // Migrate the changelog notes from the source major version to the target.
    console.log(
      `Migrating changelog notes from v${sourceBranchMajorVersion} to v${targetBranchMajorVersion}`,
    );
    changelog.withChangelog(
      (contents) =>
        changelog.processChangelogForBackports(
          sourceBranchMajorVersion,
          targetBranchMajorVersion,
          contents,
        ),
      options,
    );

    runGit(["add", "CHANGELOG.md"], {
      dryRun: options.dryRun,
    });
    runGit(["commit", "-m", `${BACKPORT_COMMIT_MESSAGE}${version}`], {
      dryRun: options.dryRun,
    });
  } else {
    // For a standard (primary) release, there won't be new commits on the
    // target branch that aren't already on the source branch, so we can just
    // start from the source branch.
    runGit(
      ["checkout", "-b", newBranchName, `${ORIGIN}/${options.sourceBranch}`],
      {
        dryRun: options.dryRun,
      },
    );

    console.log("Updating changelog");
    changelog.withChangelog(
      (contents) => changelog.setVersionAndDate(version, contents),
      { ...options, initChangelog: true },
    );

    runGit(["add", "CHANGELOG.md"], {
      dryRun: options.dryRun,
    });
    runGit(["commit", "-m", `Update changelog for v${version}`], {
      dryRun: options.dryRun,
    });
  }

  // For backports, rebuild the action unless there were merge conflicts.
  if (!options.isPrimaryRelease) {
    if (conflictedFiles.length === 0) {
      console.log("Rebuilding the Action.");
      rebuildAction(options);
    } else {
      console.log(
        `Skipping automatic rebuild because the merge produced conflicts in: ${conflictedFiles.join(", ")}`,
      );
    }
  }

  return conflictedFiles;
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
  if (
    !options.isPrimaryRelease &&
    !options.sourceBranch.startsWith(RELEASE_BRANCH_PREFIX)
  ) {
    throw new Error(
      `Expected source branch to start with '${RELEASE_BRANCH_PREFIX}' for backports, but got '${options.sourceBranch}'.`,
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

  const currentVersion = withPackageJson((content) => {
    return { value: getCurrentVersion(content) };
  }, options);

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

  // Prepare the update/backport branch.
  const conflictedFiles = await prepareNewBranch(
    options,
    newBranchName,
    targetBranchMajorVersion,
    version,
  );

  // Push the new branch to the remote.
  console.log(`Creating branch ${newBranchName}.`);
  runGit(["push", ORIGIN, newBranchName], { dryRun: options.dryRun });

  // Open a PR to merge the new branch into the target branch.
  await openPr({
    client,
    owner,
    repo,
    commits,
    sourceBranchShortSha,
    newBranchName,
    sourceBranch: options.sourceBranch,
    targetBranch: options.targetBranch,
    conductor: options.conductor,
    isPrimaryRelease: options.isPrimaryRelease,
    conflictedFiles,
    dryRun: options.dryRun,
  });
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
