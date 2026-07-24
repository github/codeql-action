import * as fs from "node:fs";

import { CHANGELOG_FILE, DryRunOption } from "./config";

/** The placeholder in the header for unreleased changes. */
export const UNRELEASED_PLACEHOLDER = "[UNRELEASED]";

/** The default contents for a section in the changelog. */
export const NO_CHANGES_STR = "No user facing changes.\n\n";

/** Placeholder changelog content for a new release. */
export const EMPTY_CHANGELOG = `# CodeQL Action Changelog

## ${UNRELEASED_PLACEHOLDER}

${NO_CHANGES_STR}`;

/**
 * Represents sections in a changelog.
 */
export interface ChangelogSection {
  headerLine: string;
  bodyLines: string[];
}

/**
 * Represents a changelog.
 */
export interface Changelog {
  preamble: string[];
  sections: ChangelogSection[];
}

/** Returns `date` formatted as `DD Mon YYYY`. */
export function getReleaseDateString(today: Date = new Date()): string {
  return today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export interface OpenChangelogOptions {
  initChangelog?: boolean;
}

export function withChangelog(
  transformer: (contents: string) => string,
  options: DryRunOption & OpenChangelogOptions,
): void {
  let content: string;

  if (options.initChangelog && !fs.existsSync(CHANGELOG_FILE)) {
    content = EMPTY_CHANGELOG;
  } else {
    content = fs.readFileSync(CHANGELOG_FILE, "utf8");
  }

  if (!options.dryRun) {
    fs.writeFileSync(CHANGELOG_FILE, transformer(content), "utf8");
  } else {
    console.info(`[DRY RUN] Would have written updated changelog.`);
  }
}

/**
 * Updates the `[UNRELEASED]` marker in `CHANGELOG.md` with the given version
 * and today's date.
 */
export function setVersionAndDate(
  version: string,
  content: string,
  date: Date = new Date(),
): string {
  const versionAndDate = `${version} - ${getReleaseDateString(date)}`;
  return content.replace(UNRELEASED_PLACEHOLDER, versionAndDate);
}

/**
 * Parses `content` into a structured representation of a changelog.
 *
 * @param content The contents of the changelog file.
 */
export function parseChangelog(content: string): Changelog {
  const lines = content.split("\n");
  let i = 0;

  const preamble: string[] = [];
  const sections: ChangelogSection[] = [];
  let currentSection: ChangelogSection | undefined = undefined;

  // Process all lines of the input file.
  while (i < lines.length) {
    const line = lines[i];

    // Sections of the changelog start with `## `.
    if (line.startsWith("## ")) {
      // We have discovered a new section. If `currentSection` is already defined,
      // then this marks the end of that section. Push it to the array of sections
      // in the changelog.
      if (currentSection !== undefined) {
        sections.push(currentSection);
      }

      // Initialise the new section.
      currentSection = { headerLine: line, bodyLines: [] };
    } else if (currentSection !== undefined) {
      // Add lines between the section header and the next to the current section.
      currentSection.bodyLines.push(line);
    } else {
      // This is neither a section header nor are we in a section already,
      // so this line is part of the preamble.
      preamble.push(line);
    }

    i++;
  }

  // Push the current section to the array of completed sections, if there is
  // still one unfinished.
  if (currentSection !== undefined) {
    sections.push(currentSection);
  }

  return { preamble, sections };
}

/**
 * Combines an array of lines into a single string by adding line breaks.
 */
export function unlines(lines: string[]): string {
  return `${lines.join("\n")}`;
}

/**
 * Renders a given changelog to a string.
 */
export function renderChangelog(changelog: Changelog): string {
  let result = unlines(changelog.preamble);

  for (const section of changelog.sections) {
    result += `\n${section.headerLine}\n${unlines(section.bodyLines)}`;
  }

  return result;
}

/**
 * Processes changelog entries for a backport, converting version references
 * from the source major version to the target major version and filtering
 * entries that only apply to newer versions.
 */
export function processChangelogForBackports(
  sourceBranchMajorVersion: string,
  targetBranchMajorVersion: string,
  content: string,
): string {
  // Changelog entries can use the following format to indicate
  // that they only apply to newer versions
  const someVersionsOnlyRegex = /\[v(\d+)\+ only\]/;

  // Parse the changelog.
  const changelog = parseChangelog(content);

  if (changelog.sections.length === 0) {
    throw new Error("Could not find any change sections in CHANGELOG.md");
  }

  // Filter out changelog entries that only apply to newer versions and
  // update the section headings with the backport major version for
  // sections we keep.
  for (const section of changelog.sections) {
    // Update the section headings with the backport major version.
    section.headerLine = section.headerLine.replace(
      `## ${sourceBranchMajorVersion}`,
      `## ${targetBranchMajorVersion}`,
    );

    const filteredEntries: string[] = [];
    let foundContent = false;

    for (const line of section.bodyLines) {
      // Skip the entry if `someVersionsOnlyRegex` matches and the major version
      // of the target branch is smaller than the required version.
      const match = someVersionsOnlyRegex.exec(line);
      if (
        match &&
        Number.parseInt(targetBranchMajorVersion) < Number.parseInt(match[1])
      ) {
        continue;
      }

      // Keep the line.
      filteredEntries.push(line);

      // Set `foundContent` to `true` if the line is not empty.
      if (line.trim() !== "") {
        foundContent = true;
      }
    }

    // Update the section with the retained entries.
    section.bodyLines = filteredEntries;

    // Add an entry if we didn't keep any.
    if (!foundContent) {
      section.bodyLines.push(NO_CHANGES_STR.trim());
    }
  }

  return renderChangelog(changelog);
}
