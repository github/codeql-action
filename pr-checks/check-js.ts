#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import * as path from "node:path";

import * as core from "@actions/core";

import { runCommand, runGit } from "./command";
import { LIB_ROOT, PR_CHECKS_DIR, REPO_ROOT } from "./config";
import { getErrorMessage } from "./util";

function main() {
  // Sanity check that repo is clean to start with
  try {
    runGit(["diff", "--exit-code"], { allowNonZeroExitCode: false });
    console.info("Repository is clean.");
  } catch (err) {
    // If we get a fail here then this workflow needs attention...
    console.error(getErrorMessage(err));
    console.error("Failed: Repo should be clean before testing!");
    return -1;
  }

  // Wipe the lib directory in case there are extra unnecessary files in there
  console.info(`Removing ${LIB_ROOT}...`);
  fs.rmSync(LIB_ROOT, { recursive: true, force: true });

  // Generate the JavaScript files
  runCommand("npm", ["run", "build"], { execOptions: { shell: true } });

  // Check that repo is still clean
  try {
    runGit(["diff", "--exit-code"], { allowNonZeroExitCode: false });
    console.info("Repository is clean.");
  } catch (err) {
    // If we get a fail here then the PR needs attention
    console.error(getErrorMessage(err));
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

if (require.main === module) {
  process.exit(main());
}
