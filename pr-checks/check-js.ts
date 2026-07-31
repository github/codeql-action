#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import * as path from "node:path";

import * as core from "@actions/core";

import { runCommand, runGit } from "./command";
import { LIB_ROOT, PR_CHECKS_DIR, REPO_ROOT } from "./config";

/**
 * Checks whether the repo is clean by running `git status --porcelain`.
 * If the repository is not clean, the changes are printed to stdout.
 *
 * @returns `true` if the repo is clean or `false` otherwise.
 */
function isRepoClean(): boolean {
  const stdout = runGit(["status", "--porcelain"]);

  if (stdout === "") {
    return true;
  }

  console.log(stdout);
  return false;
}

function main() {
  // Sanity check that repo is clean to start with
  if (isRepoClean()) {
    console.info("Repository is clean.");
  } else {
    // If we get a fail here then this workflow needs attention...
    console.error("The repository contains uncomitted changes!");
    return -1;
  }

  // Wipe the lib directory in case there are extra unnecessary files in there
  console.info(`Removing ${LIB_ROOT}...`);
  fs.rmSync(LIB_ROOT, { recursive: true, force: true });

  // Generate the JavaScript files
  runCommand("npm", ["run", "build"], { execOptions: { shell: true } });

  // Check that repo is still clean
  if (isRepoClean()) {
    console.info("Repository is clean.");
  } else {
    // If we get a fail here then the PR needs attention
    console.error("Failed: JavaScript files are not up to date.");
    console.error("Run 'rm -rf lib && npm run build' to update.");

    const diffFile = path.join(
      process.env["RUNNER_TEMP"] ?? PR_CHECKS_DIR,
      "js.diff",
    );
    runCommand("git", ["status"]);
    runCommand("git", ["diff", `--output=${diffFile}`], {
      execOptions: { cwd: REPO_ROOT },
    });

    core.summary.addHeading("Transpiled JS diff", 3);
    core.summary.addCodeBlock(fs.readFileSync(diffFile, "utf-8"), "diff");

    fs.rmSync(diffFile);

    // Reset bundled files to allow other checks to test for changes
    runCommand("git", ["checkout", "lib"]);

    return 1;
  }

  console.info("Success: JavaScript files are up to date");
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
