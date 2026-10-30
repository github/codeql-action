#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

import * as core from "@actions/core";

import { runCommand, runGit } from "./command";
import { LIB_ROOT, PR_CHECKS_DIR, REPO_ROOT } from "./config";
import { getErrorMessage } from "./util";

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

/**
 * Checks whether the repository is clean to begin with, then runs {@link body}, and finally
 * checks if the repository is still clean.
 *
 * @param body The function to run.
 * @returns `true` if the repo is clean or `false` otherwise.
 */
function checkUnchanged(body: () => void): boolean {
  // Sanity check that repo is clean to start with
  if (isRepoClean()) {
    console.info("Repository is clean.");
  } else {
    // If we get a fail here then this workflow needs attention...
    console.error("The repository contains uncomitted changes!");
    return false;
  }

  body();

  // Check that repo is still clean
  const result = isRepoClean();
  if (result) {
    console.info("Repository is still clean.");
  } else {
    console.info("Repository is now dirty.");
  }
  return result;
}

/**
 * Produces a full diff for the repository and adds it to the workflow job summary
 * under the {@link summaryHeader} header.
 */
function addDiffToSummary(summaryHeader: string) {
  const diffFile = path.join(
    process.env["RUNNER_TEMP"] ?? PR_CHECKS_DIR,
    "summary.diff",
  );

  try {
    runCommand("git", ["status"]);
    runCommand("git", ["diff", `--output=${diffFile}`], {
      execOptions: { cwd: REPO_ROOT },
    });

    core.summary.addHeading(summaryHeader, 3);
    core.summary.addCodeBlock(fs.readFileSync(diffFile, "utf-8"), "diff");

    try {
      fs.rmSync(diffFile);
    } catch (err) {
      console.warn(
        `Failed to remove temporary diff file from '${diffFile}': ${getErrorMessage(err)}`,
      );
    }
  } catch (err) {
    console.error(
      `Failed to add full diff to summary for '${summaryHeader}': ${getErrorMessage(err)}`,
    );
  }
}

/**
 * Rebuilds the JavaScript by cleaning up and running `npm run build`.
 */
function rebuildJavaScript() {
  // Wipe the lib directory in case there are extra unnecessary files in there
  console.info(`Removing ${LIB_ROOT}...`);
  fs.rmSync(LIB_ROOT, { recursive: true, force: true });

  // Generate the JavaScript files
  runCommand("npm", ["run", "build"], { execOptions: { shell: true } });
}

/**
 * Formats YAML files with `npm run format-yaml`.
 */
function formatYAML() {
  runCommand("npm", ["run", "format-yaml"], { execOptions: { shell: true } });
}

function main() {
  const { values: options } = parseArgs({
    options: { language: { type: "string", default: "javascript" } },
  });
  console.info(`Checking that ${options.language} files are unchanged.`);

  if (options.language === "javascript") {
    if (!checkUnchanged(rebuildJavaScript)) {
      // If we get a fail here then the PR needs attention
      console.error("Failed: JavaScript files are not up to date.");
      console.error("Run 'rm -rf lib && npm run build' to update.");

      addDiffToSummary("Transpiled JS diff");

      // Reset bundled files to allow other checks to test for changes
      runCommand("git", ["checkout", "lib"]);

      return 1;
    }

    console.info("Success: JavaScript files are up to date");
  } else if (options.language === "yaml") {
    if (!checkUnchanged(formatYAML)) {
      // If we get a fail here then the PR needs attention
      console.error("Failed: YAML files are not correctly formatted.");
      console.error("Run 'npm run format-yaml' to format them.");

      addDiffToSummary("YAML formatting changes");

      return 1;
    }

    console.info("Success: YAML files are correctly formatted");
  } else {
    console.error(`Unknown language: ${options.language}`);
  }

  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
