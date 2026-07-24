#!/usr/bin/env npx tsx

/**
 * Replaces the current, first section of the changelog with a new one for the rollback release.
 */

import * as fs from "node:fs";
import { parseArgs } from "node:util";

import {
  Changelog,
  ChangelogSection,
  getReleaseDateString,
  parseChangelog,
  renderChangelog,
} from "./changelog";
import { CHANGELOG_FILE } from "./config";
import { getErrorMessage } from "./util";

export interface RollbackChangelogInputs {
  "target-version": string;
  "rollback-version": string;
  "new-version": string;
  today?: Date;
}

/**
 * Replaces the current, first section of the changelog with a new one for the rollback release.
 */
export function updateChangelog(
  changelog: Changelog,
  versions: RollbackChangelogInputs,
) {
  // Drop the existing first section.
  changelog.sections.shift();

  // Construct the section for the rollback version.
  const newSection: ChangelogSection = {
    headerLine: `## ${versions["new-version"]} - ${getReleaseDateString(versions.today)}`,
    bodyLines: [
      "",
      `This release rolls back ${versions["rollback-version"]} due to issues with that release. It is identical to ${versions["target-version"]}.`,
      "",
    ],
  };

  // Add the new section at the top of the changelog.
  changelog.sections.unshift(newSection);
}

function main() {
  try {
    const { values } = parseArgs({
      options: {
        "target-version": {
          type: "string",
          short: "t",
        },
        "rollback-version": {
          type: "string",
          short: "r",
        },
        "new-version": {
          type: "string",
          short: "n",
        },
      },
      strict: true,
    });

    for (const key of Object.keys(values)) {
      if (key === undefined || key.trim() === "") {
        throw new Error(`Argument '--${key}' is required.`);
      }
    }

    const changelog = parseChangelog(fs.readFileSync(CHANGELOG_FILE, "utf-8"));
    updateChangelog(changelog, values as RollbackChangelogInputs);
    console.info(renderChangelog(changelog));

    return 0;
  } catch (err) {
    console.error(
      `Failed to prepare rollback changelog: ${getErrorMessage(err)}`,
    );
    return -1;
  }
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  process.exit(main());
}
