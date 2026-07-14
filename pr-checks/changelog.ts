import * as fs from "node:fs";

import { CHANGELOG_FILE, DryRunOption } from "./config";

/** Placeholder changelog content for a new release. */
export const EMPTY_CHANGELOG = `# CodeQL Action Changelog

## [UNRELEASED]

No user facing changes.

`;

/** Returns today's date formatted as `DD Mon YYYY`. */
export function getTodayString(): string {
  const today = new Date();
  return today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Updates the `[UNRELEASED]` marker in `CHANGELOG.md` with the given version
 * and today's date.
 */
export function setVersionAndDate(
  options: DryRunOption,
  version: string,
): void {
  let content: string;

  if (fs.existsSync(CHANGELOG_FILE)) {
    content = fs.readFileSync(CHANGELOG_FILE, "utf8");
  } else {
    content = EMPTY_CHANGELOG;
  }

  const versionAndDate = `${version} - ${getTodayString()}`;
  const newContent = content.replace("[UNRELEASED]", versionAndDate);

  if (!options.dryRun) {
    fs.writeFileSync(CHANGELOG_FILE, newContent, "utf8");
  } else {
    console.info(
      `[DRY RUN] Would have replaced '[UNRELEASED]' in '${CHANGELOG_FILE}' with '${versionAndDate}'.`,
    );
  }
}

/**
 * Processes changelog entries for a backport, converting version references
 * from the source major version to the target major version and filtering
 * entries that only apply to newer versions.
 */
export function processChangelogForBackports(
  sourceBranchMajorVersion: string,
  targetBranchMajorVersion: string,
): void {
  const content = fs.readFileSync(CHANGELOG_FILE, "utf8");
  const lines = content.split("\n");
  const someVersionsOnlyRegex = /\[v(\d+)\+ only\]/;

  let output = "";
  let i = 0;

  // Copy lines until we find the first section heading.
  let foundFirstSection = false;
  while (!foundFirstSection && i < lines.length) {
    let line = lines[i];
    if (line.startsWith("## ")) {
      line = line.replace(
        `## ${sourceBranchMajorVersion}`,
        `## ${targetBranchMajorVersion}`,
      );
      foundFirstSection = true;
    }
    output += `${line}\n`;
    i++;
  }

  if (!foundFirstSection) {
    throw new Error("Could not find any change sections in CHANGELOG.md");
  }

  // Process remaining lines.
  let foundContent = false;
  output += "\n";

  while (i < lines.length) {
    let line = lines[i];
    i++;

    // Filter out changelog entries that only apply to newer versions.
    const match = someVersionsOnlyRegex.exec(line);
    if (match) {
      if (
        Number.parseInt(targetBranchMajorVersion) < Number.parseInt(match[1])
      ) {
        continue;
      }
    }

    if (line.startsWith("## ")) {
      line = line.replace(
        `## ${sourceBranchMajorVersion}`,
        `## ${targetBranchMajorVersion}`,
      );
      if (!foundContent) {
        output += "No user facing changes.\n";
      }
      foundContent = false;
      output += `\n${line}\n\n`;
    } else {
      if (line.trim() !== "") {
        foundContent = true;
        output += `${line}\n`;
      }
    }
  }

  fs.writeFileSync(CHANGELOG_FILE, output, "utf8");
}
