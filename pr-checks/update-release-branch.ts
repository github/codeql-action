#!/usr/bin/env npx tsx

import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import * as fs from "node:fs";
import { parseArgs } from "node:util";

import { type ApiClient, getApiClient } from "./api-client";
import { CHANGELOG_FILE, PACKAGE_JSON, REPO_ROOT } from "./config";

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

/** Options for {@link runCommand}. */
export interface RunCommandOptions {
  /** A value indicating whether to just log the command, rather than run it. */
  dryRun?: boolean;

  /** Options for `execFileSync`. */
  execOptions?: ExecFileSyncOptions;
}

/**
 * Runs a command, streaming output to the console by default.
 *
 * @param command The name of the command to run.
 * @param args The arguments for the command.
 * @throws When the process exists with a non-zero exit code.
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
export interface RunGitOptions {
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

/** Reads the current version from `package.json`. */
export function getCurrentVersion(): string | undefined {
  const pkg: { version: string } = JSON.parse(
    fs.readFileSync(PACKAGE_JSON, "utf8"),
  );
  return pkg.version;
}

/**
 * Replaces the version in `package.json` textually. Only updates the version
 * field that immediately follows the `"name": "codeql"` line.
 */
export function replaceVersionInPackageJson(
  prevVersion: string,
  newVersion: string,
): void {
  const lines = fs.readFileSync(PACKAGE_JSON, "utf8").split("\n");
  let prevLineIsCodeql = false;
  const output: string[] = [];

  for (const line of lines) {
    if (prevLineIsCodeql && line.includes(`"version": "${prevVersion}"`)) {
      output.push(line.replace(prevVersion, newVersion));
    } else {
      output.push(line);
    }
    prevLineIsCodeql = line.includes('"name": "codeql",');
  }

  fs.writeFileSync(PACKAGE_JSON, `${output.join("\n")}\n`, "utf8");
}

/** Returns today's date formatted as `DD Mon YYYY`. */
export function getTodayString(): string {
  const today = new Date();
  return today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Updates the `[UNRELEASED]` marker in `CHANGELOG.md` with the given version
 * and today's date.
 */
export function updateChangelog(options: MainOptions, version: string): void {
  let content: string;

  if (fs.existsSync(CHANGELOG_FILE)) {
    content = fs.readFileSync(CHANGELOG_FILE, "utf8");
  } else {
    content = EMPTY_CHANGELOG;
  }

  const versionAndDate = `${version} - ${getTodayString()}`;
  const newContent = content.replace("[UNRELEASED]", versionAndDate);

  if (!options.dryRun) {
    fs.writeFileSync(CHANGELOG_FILE, newContent, "utf8");
  } else {
    console.info(
      `[DRY RUN] Would have replaced '[UNRELEASED]' in '${CHANGELOG_FILE}' with '${versionAndDate}'.`,
    );
  }
}

/**
 * Processes changelog entries for a backport, converting version references
 * from the source major version to the target major version and filtering
 * entries that only apply to newer versions.
 */
export function processChangelogForBackports(
  sourceBranchMajorVersion: string,
  targetBranchMajorVersion: string,
): void {
  const content = fs.readFileSync(CHANGELOG_FILE, "utf8");
  const lines = content.split("\n");
  const someVersionsOnlyRegex = /\[v(\d+)\+ only\]/;

  let output = "";
  let i = 0;

  // Copy lines until we find the first section heading.
  let foundFirstSection = false;
  while (!foundFirstSection && i < lines.length) {
    let line = lines[i];
    if (line.startsWith("## ")) {
      line = line.replace(
        `## ${sourceBranchMajorVersion}`,
        `## ${targetBranchMajorVersion}`,
      );
      foundFirstSection = true;
    }
    output += `${line}\n`;
    i++;
  }

  if (!foundFirstSection) {
    throw new Error("Could not find any change sections in CHANGELOG.md");
  }

  // Process remaining lines.
  let foundContent = false;
  output += "\n";

  while (i < lines.length) {
    let line = lines[i];
    i++;

    // Filter out changelog entries that only apply to newer versions.
    const match = someVersionsOnlyRegex.exec(line);
    if (match) {
      if (
        Number.parseInt(targetBranchMajorVersion) < Number.parseInt(match[1])
      ) {
        continue;
      }
    }

    if (line.startsWith("## ")) {
      line = line.replace(
        `## ${sourceBranchMajorVersion}`,
        `## ${targetBranchMajorVersion}`,
      );
      if (!foundContent) {
        output += "No user facing changes.\n";
      }
      foundContent = false;
      output += `\n${line}\n\n`;
    } else {
      if (line.trim() !== "") {
        foundContent = true;
        output += `${line}\n`;
      }
    }
  }

  fs.writeFileSync(CHANGELOG_FILE, output, "utf8");
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

/**
 * Rebuilds the action (npm ci + npm run build) and commits any changes.
 */
export function rebuildAction(options: MainOptions): void {
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
): Promise<void> {
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

    // Revert the commit that updated the version number and changelog to refer
    // to older variants. This avoids merge conflicts when we merge in the newer
    // release branch. The commit won't exist the first time we release a new
    // major version, so we search for it conditionally.
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
    const currentPkgVersion = getCurrentVersion();
    if (currentPkgVersion) {
      replaceVersionInPackageJson(currentPkgVersion, version);
    }
    runGit(["add", "package.json"], {
      dryRun: options.dryRun,
    });

    // Migrate the changelog notes from the source major version to the target.
    console.log(
      `Migrating changelog notes from v${sourceBranchMajorVersion} to v${targetBranchMajorVersion}`,
    );
    processChangelogForBackports(
      sourceBranchMajorVersion,
      targetBranchMajorVersion,
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
    updateChangelog(options, version);

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

  // Prepare the update/backport branch.
  await prepareNewBranch(
    options,
    newBranchName,
    targetBranchMajorVersion,
    version,
  );

  // Push the new branch to the remote.
  console.log(`Creating branch ${newBranchName}.`);
  runGit(["push", ORIGIN, newBranchName], { dryRun: options.dryRun });
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
