#!/usr/bin/env npx tsx

import { parseArgs } from "node:util";

import * as core from "@actions/core";

import { OLDEST_SUPPORTED_MAJOR_VERSION } from "./config";

/** The results of checking which release branches to backport to.  */
export interface BackportInfo {
  /** The source release branch. */
  backportSourceBranch: string;
  /**
   * The computed release branches we should backport to.
   * Will be empty if there are no branches we need to backport to.
   */
  backportTargetBranches: string[];
}

/**
 * Compute the backport source and target branches for a release.
 *
 * @param majorVersion - The major version string (e.g. "v4").
 * @param latestTag - The most recent tag published to the repository (e.g. "v4.32.6").
 * @param oldestSupportedMajorVersion - The oldest supported major version number.
 * @returns The names of the source branch and target branches.
 */
export function computeBackportBranches(
  majorVersion: string,
  latestTag: string,
  oldestSupportedMajorVersion: number,
): BackportInfo {
  // Perform some sanity checks on the inputs.
  // For `majorVersion`, we expect exactly `vN` for some `N`.
  const majorVersionMatch = majorVersion.match(/^v(\d+)$/);
  if (!majorVersionMatch) {
    throw new Error("--major-version value must be in `vN` format.");
  }

  // For latestTag, we expect something starting with `vN.M.P`
  const latestTagMatch = latestTag.match(/^v(\d+)\.\d+\.\d+/);
  if (!latestTagMatch) {
    throw new Error(
      `--latest-tag value must be in 'vN.M.P' format, but '${latestTag}' is not.`,
    );
  }

  const majorVersionNumber = Number.parseInt(majorVersionMatch[1]);
  const latestTagMajor = Number.parseInt(latestTagMatch[1]);

  // If this is a primary release, we backport to all supported branches,
  // so we check whether the majorVersion taken from the package.json
  // is greater than or equal to the latest tag pulled from the repo.
  // For example...
  //     'v1' >= 'v2' is False # we're operating from an older release branch and should not backport
  //     'v2' >= 'v2' is True  # the normal case where we're updating the current version
  //     'v3' >= 'v2' is True  # in this case we are making the first release of a new major version
  const considerBackports = majorVersionNumber >= latestTagMajor;

  const backportSourceBranch = `releases/v${majorVersionNumber}`;
  const backportTargetBranches: string[] = [];

  if (considerBackports) {
    for (let i = majorVersionNumber - 1; i > 0; i--) {
      const branchName = `releases/v${i}`;
      if (i >= oldestSupportedMajorVersion) {
        backportTargetBranches.push(branchName);
      }
    }
  }

  return { backportSourceBranch, backportTargetBranches };
}

async function main() {
  const { values: options } = parseArgs({
    options: {
      // The major version of the release in `vN` format (e.g. `v4`).
      "major-version": {
        type: "string",
      },
      // The most recent tag published to the repository (e.g. `v4.28.0`).
      "latest-tag": {
        type: "string",
      },
    },
    strict: true,
  });

  if (options["major-version"] === undefined) {
    throw Error("--major-version is required");
  }
  if (options["latest-tag"] === undefined) {
    throw Error("--latest-tag is required");
  }

  const majorVersion = options["major-version"];
  const latestTag = options["latest-tag"];

  console.log(`Major version: ${majorVersion}`);
  console.log(`Latest tag: ${latestTag}`);

  const result = computeBackportBranches(
    majorVersion,
    latestTag,
    OLDEST_SUPPORTED_MAJOR_VERSION,
  );

  core.setOutput("backport_source_branch", result.backportSourceBranch);
  core.setOutput(
    "backport_target_branches",
    JSON.stringify(result.backportTargetBranches),
  );

  process.exit(0);
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
