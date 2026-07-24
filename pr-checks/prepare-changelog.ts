#!/usr/bin/env npx tsx

/**
 * Extracts the body of the first changelog section and outputs it to either
 * stdout or a file.
 */

import * as fs from "node:fs";
import { parseArgs } from "node:util";

import { getErrorMessage } from "../src/util";

import { NO_CHANGES_STR, parseChangelog } from "./changelog";
import { CHANGELOG_FILE } from "./config";

/**
 * Prepare the changelog for the new release
 * This function will extract the part of the changelog that
 * we want to include in the new release.
 *
 * @param changelogPath The path to the changelog file.
 */
export function extractChangelogSnippet(changelogPath: string) {
  try {
    const content = fs.readFileSync(changelogPath, "utf-8");
    const changelog = parseChangelog(content);

    // Return an empty string if we couldn't find the first section.
    if (changelog.sections.length === 0) {
      return "";
    }

    return changelog.sections[0].bodyLines.join("\n").trim();
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      console.error(`Changelog file at '${changelogPath}' does not exist.`);
      return NO_CHANGES_STR;
    } else {
      throw Error(
        `Failed to open changelog file at '${changelogPath}': ${getErrorMessage(err)}`,
      );
    }
  }
}

function main() {
  try {
    const { values } = parseArgs({
      options: {
        changelog: {
          type: "string",
          short: "f",
          default: CHANGELOG_FILE,
        },
        output: {
          type: "string",
          short: "o",
        },
      },
      strict: true,
    });

    const body = extractChangelogSnippet(values.changelog);

    // If no `output` argument was provided, output to stdout. Otherwise,
    // write a file to the specified path.
    if (values.output === undefined) {
      console.info(body);
    } else {
      fs.writeFileSync(values.output, body);
    }

    return 0;
  } catch (err) {
    console.error(`Failed to prepare changelog: ${getErrorMessage(err)}`);
    return -1;
  }
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  process.exit(main());
}
