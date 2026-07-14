#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import { parseArgs } from "node:util";

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

/** Reads the current version from `package.json`. */
export function getCurrentVersion(): string | undefined {
  const pkg: { version: string } = JSON.parse(
    fs.readFileSync(PACKAGE_JSON, "utf8"),
  );
  return pkg.version;
}

interface MainOptions {
  repositoryNwo: string;
  sourceBranch: string;
  targetBranch: string;
  isPrimaryRelease: boolean;
  conductor: string;
}

function parseCliOptions(): MainOptions {
  const { values } = parseArgs({
    options: {
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

  if (!options.targetBranch.startsWith(RELEASE_BRANCH_PREFIX)) {
    throw new Error(
      `Expected target branch to start with '${RELEASE_BRANCH_PREFIX}', but got '${options.targetBranch}'.`,
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
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
