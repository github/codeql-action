#!/usr/bin/env npx tsx

/**
 * Updates the changelog with a change note for an updated CodeQL CLI bundle.
 */

import * as fs from "node:fs";

import { getErrorMessage } from "../src/util";

import {
  parseChangelog,
  renderChangelog,
  UNRELEASED_PLACEHOLDER,
} from "./changelog";
import { CHANGELOG_FILE, CLI_BUNDLE_RELEASE_URL_PREFIX } from "./config";

export const CLI_VERSION_ENV_VAR = "CLI_VERSION";
export const PR_URL_ENV_VAR = "PR_URL";

/** Gets the CLI version from the environment. */
export function getCLIVersion() {
  const cliVersion = process.env[CLI_VERSION_ENV_VAR];

  if (cliVersion === undefined || cliVersion.trim() === "") {
    throw new Error(`No CLI version was set in '${CLI_VERSION_ENV_VAR}'.`);
  }

  return cliVersion;
}

/** Gets the PR URL from the environment. */
export function getPRUrl() {
  const prUrl = process.env[PR_URL_ENV_VAR];

  if (prUrl === undefined || prUrl.trim() === "") {
    throw new Error(`No PR URL was set in '${PR_URL_ENV_VAR}'.`);
  }

  return prUrl;
}

/**
 * Gets the PR number from something like a PR URL.
 */
export function getPRNumber(prUrl: string) {
  const prUrlParts = prUrl.split("/");
  const prNumberStr = prUrlParts[prUrlParts.length - 1];

  const prNumber = Number.parseInt(prNumberStr, 10);

  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(
      `Invalid PR URL '${prUrl}': last part is not a positive number`,
    );
  }

  return prNumber;
}

/**
 * Updates `changelog` by adding `changelogNote` to the first section.
 *
 * @param contents The existing changelog contents.
 * @param changelogNote The note to add to the first section.
 */
export function updateChangelog(contents: string, changelogNote: string) {
  // If the "[UNRELEASED]" section starts with "no user facing changes", remove that line.
  contents = contents.replace(
    `## ${UNRELEASED_PLACEHOLDER}\n\nNo user facing changes.`,
    `## ${UNRELEASED_PLACEHOLDER}\n`,
  );

  const changelog = parseChangelog(contents);

  if (changelog.sections.length === 0) {
    throw new Error("The changelog contains no existing sections.");
  }

  // Add the changelog note to the bottom of the first section.
  const firstSection = changelog.sections[0];
  const lastLine = firstSection.bodyLines.pop();

  if (lastLine !== undefined && lastLine.trim() !== "") {
    // We expect the last line to be empty. If it isn't for some reason,
    // add it back.
    firstSection.bodyLines.push(lastLine);
  }

  firstSection.bodyLines.push(changelogNote);

  // If the last line is empty as expected, then add it back in after the new note.
  if (lastLine?.trim() === "") {
    firstSection.bodyLines.push(lastLine);
  }

  return renderChangelog(changelog);
}

function main() {
  try {
    const cliVersion = getCLIVersion();
    const prUrl = getPRUrl();

    // The GitHub Release for the new bundle version.
    const bundleReleaseUrl = `${CLI_BUNDLE_RELEASE_URL_PREFIX}${cliVersion}`;

    // Get the PR number from the PR URL.
    const prNumber = getPRNumber(prUrl);
    const changelogNote = `- Update default CodeQL bundle version to [${cliVersion}](${bundleReleaseUrl}). [#${prNumber}](${prUrl})`;

    let changelog = fs.readFileSync(CHANGELOG_FILE, "utf-8");

    changelog = updateChangelog(changelog, changelogNote);

    fs.writeFileSync(CHANGELOG_FILE, changelog);

    return 0;
  } catch (err) {
    console.error(`Failed to bundle changelog: ${getErrorMessage(err)}`);
    return -1;
  }
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  process.exit(main());
}
