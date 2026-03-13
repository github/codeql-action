#!/usr/bin/env npx tsx

import { parseArgs } from "node:util";

import * as core from "@actions/core";

import { OLDEST_SUPPORTED_MAJOR_VERSION } from "./config";

async function main() {
  const { values: options } = parseArgs({
    options: {
      // The major version of the release
      "major-version": {
        type: "string",
      },
      // The most recent tag published to the repository
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

  const majorVersion = Number.parseInt(options["major-version"].substring(1));
  const latestTag = options["latest-tag"];

  console.log(`major_version: v${majorVersion}`);
  console.log(`latest_tag: ${latestTag}`);

  // If this is a primary release, we backport to all supported branches,
  // so we check whether the major_version taken from the package.json
  // is greater than or equal to the latest tag pulled from the repo.
  // For example...
  //     'v1' >= 'v2' is False # we're operating from an older release branch and should not backport
  //     'v2' >= 'v2' is True  # the normal case where we're updating the current version
  //     'v3' >= 'v2' is True  # in this case we are making the first release of a new major version
  const latestTagMajor = Number.parseInt(latestTag.split(".")[0].substring(1));
  const considerBackports = majorVersion >= latestTagMajor;

  core.setOutput("backport_source_branch", `releases/v${majorVersion}`);

  const backportTargetBranches: string[] = [];

  if (considerBackports) {
    for (let i = latestTagMajor - 1; i > 0; i--) {
      const branch_name = `releases/v${i}`;
      if (i >= OLDEST_SUPPORTED_MAJOR_VERSION) {
        backportTargetBranches.push(branch_name);
      }
    }
  }

  core.setOutput(
    "backport_target_branches",
    JSON.stringify(backportTargetBranches),
  );

  process.exit(0);
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  void main();
}
