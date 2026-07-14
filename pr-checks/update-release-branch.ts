#!/usr/bin/env npx tsx

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

async function main(): Promise<void> {
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
