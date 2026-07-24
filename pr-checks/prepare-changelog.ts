#!/usr/bin/env npx tsx

/**
 * Extracts the body of the first changelog section and outputs it to either
 * stdout or a file.
 */

import * as fs from "node:fs";
import { parseArgs } from "node:util";

import { getErrorMessage } from "../src/util";

import { NO_CHANGES_STR } from "./changelog";
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
    const lines = fs.readFileSync(changelogPath, "utf-8").split("\n");
    const output: string[] = [];
    let foundFirstSection = false;

    // Extract the body of the first section in the changelog file.
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (foundFirstSection) {
          // This is the second section header we have found, which means that we have
          // captured all lines in the first section in `output`. We can stop here.
          break;
        }

        // We have discovered the first section header.
        foundFirstSection = true;
      } else if (foundFirstSection) {
        // Add lines between the first section header (if any) and the next to the output.
        output.push(line);
      }
    }

    return output.join("\n").trim();
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
