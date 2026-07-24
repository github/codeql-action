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
  const lines = content.split("\n");

  // Changelog entries can use the following format to indicate
  // that they only apply to newer versions
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
  // `foundContent` tracks whether we hit two headings in a row
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

  return output;
}
