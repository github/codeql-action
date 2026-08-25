import * as fs from "node:fs";
import * as path from "node:path";

import { matter } from "lite-matter";
import { fromMarkdown } from "mdast-util-from-markdown";

// Regex for filename: YYYY-MM-DD-id.md
const VALID_CHANGE_NOTE_FILENAME_PATTERN =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

export const VALID_CHANGE_NOTE_CATEGORIES = {
  breaking: "Breaking Changes",
  feature: "New Features",
  improvement: "Improvements",
  securityFix: "Security Fixes",
  fix: "Bug Fixes",
  unship: "Removed Features",
  deprecation: "Deprecations",
  knownIssue: "Known Issues",
  misc: "Miscellaneous",
};

/**
 * Validates that the given Markdown string meets the criteria for a change-note, which is:
 * - A single unordered list
 * - Each list item must start with a hyphen (-)
 * - No other Markdown elements are allowed
 * @param content The Markdown string to validate
 * @returns True if the string is a valid change-note, false otherwise
 */
export function isValidChangenoteContent(content: string): boolean {
  const ast = fromMarkdown(content);

  if (
    ast.children.length !== 1 ||
    ast.children[0].type !== "list" ||
    ast.children[0].ordered === true
  ) {
    return false;
  }

  const lines = content.split("\n");
  return ast.children[0].children.every((listItem) => {
    return lines[listItem.position!.start.line - 1].startsWith("-");
  });
}

/**
 * Validates that the given filename meets the criteria for a change-note filename.
 * @param filename The name of the change-note file to validate.
 * @returns True if the filename is valid, false otherwise.
 */
export function isValidChangenoteFilename(filename: string): boolean {
  return filename.match(VALID_CHANGE_NOTE_FILENAME_PATTERN) !== null;
}

/**
 * Validates that the given frontmatter has a valid change-note category.
 * @param frontmatter The frontmatter object to validate.
 * @returns True if the frontmatter has a valid category, false otherwise.
 */
export function hasValidChangenoteCategory(
  frontmatter: Record<string, unknown>,
): boolean {
  const category = frontmatter["category"];
  return (
    typeof category === "string" && category in VALID_CHANGE_NOTE_CATEGORIES
  );
}

/**
 * Validates that the given change-note file meets all of the criteria for a change-note.
 * @param filename The name of the change-note file to validate.
 * @returns True if the file is a valid change-note, false otherwise.
 */
export function isValidChangenoteFile(filename: string): boolean {
  let isValid: boolean = true;

  const { data: frontmatter, content } = matter(
    fs.readFileSync(filename, "utf8"),
  );

  if (!isValidChangenoteFilename(path.basename(filename))) {
    isValid = false;
    console.error(
      `${filename}: invalid filename; must match pattern YYYY-MM-DD-id.md`,
    );
  }
  if (!hasValidChangenoteCategory(frontmatter)) {
    isValid = false;
    const categories = Object.keys(VALID_CHANGE_NOTE_CATEGORIES).join(", ");
    console.error(
      `${filename}: invalid category; must be one of: ${categories}`,
    );
  }
  if (!isValidChangenoteContent(content)) {
    isValid = false;
    console.error(
      `${filename}: invalid Markdown; content must be a single unordered list with hyphen bullets and no other Markdown elements`,
    );
  }

  return isValid;
}
