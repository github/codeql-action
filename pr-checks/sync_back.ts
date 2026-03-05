#!/usr/bin/env npx tsx

/*
Sync-back script to automatically update action versions in source templates
from the generated workflow files after Dependabot updates.

This script scans the generated workflow files (.github/workflows/__*.yml) to find
all external action versions used, then updates:
1. Hardcoded action versions in pr-checks/sync.ts
2. Action version references in template files in pr-checks/checks/

The script automatically detects all actions used in generated workflows and
preserves version comments (e.g., # v1.2.3) when syncing versions.

This ensures that when Dependabot updates action versions in generated workflows,
those changes are properly synced back to the source templates. Regular workflow
files are updated directly by Dependabot and don't need sync-back.
*/

import { parseArgs } from "node:util";

import * as fs from "fs";
import * as path from "path";

const THIS_DIR = __dirname;
const CHECKS_DIR = path.join(THIS_DIR, "checks");
const WORKFLOW_DIR = path.join(THIS_DIR, "..", ".github", "workflows");
const SYNC_TS_PATH = path.join(THIS_DIR, "sync.ts");

/**
 * Used to find action references (including versions and comments) in a workflow file.
 *
 * This pattern captures `action_name` and `version_with_possible_comment` from
 * `uses: action_name@version_with_possible_comment`. For example, if we have
 *
 * ```
 * uses: ruby/setup-ruby@09a7688d3b55cf0e976497ff046b70949eeaccfd # v1.288.0
 * ```
 *
 * in a workflow file, this regular expression gets us:
 *
 * - `ruby/setup-ruby`; and
 * - `09a7688d3b55cf0e976497ff046b70949eeaccfd # v1.288.0`.
 */
const EXTRACT_ACTION_REF_PATTERN: RegExp =
  /uses:\s+([^/\s]+\/[^@\s]+)@([^@\n]+)/g;

/**
 * Used to identify characters in `action_name` strings that need to
 * be escaped before inserting them into TypeScript or YAML strings.
 */
const ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;

/**
 * A `SyncBackPattern` is a function which constructs a regular expression for a specific `actionName`,
 * which finds references to `actionName` and surrounding context in a particular file that we want
 * to sync updated versions back to.
 */
type SyncBackPattern = (actionName: string) => RegExp;

/**
 * Used to find lines containing action references in `sync.ts`.
 *
 * Matches `uses: "actionName@version_str"` in PR check specifications and groups `uses: "`
 * and `"`, allowing `actionName@version_str` to be replaced with a new action reference.
 */
const TS_PATTERN: SyncBackPattern = (actionName: string) =>
  new RegExp(`(uses:\\s*")${actionName}@(?:[^"]+)(")`, "g");

/**
 * Used to find lines containing action references in a PR check specification.
 *
 * Matches `uses: actionName@rest_of_line` in PR check specifications and extracts `uses: actionName`,
 * allowing `rest_of_line` to be replaced with a new version string.
 */
const YAML_PATTERN: SyncBackPattern = (actionName: string) =>
  new RegExp(`(uses:\\s+${actionName})@(?:[^@\n]+)`, "g");

/**
 * Constructs a regular expression using `patternFunction` for `actionName`, which is sanitised
 * before `patternFunction` is called.
 *
 * @param patternFunction The pattern builder to use.
 * @param actionName The action name, which will be sanitised.
 * @returns The regular expression returned by `patternFunction`.
 */
function makeReplacementPattern(
  patternFunction: SyncBackPattern,
  actionName: string,
): RegExp {
  return patternFunction(actionName.replace(ESCAPE_PATTERN, "\\$&"));
}

/**
 * Scan generated workflow files to extract the latest action versions.
 *
 * @param workflowDir - Path to .github/workflows directory
 * @returns Map from action names to their latest versions (including comments)
 */
export function scanGeneratedWorkflows(
  workflowDir: string,
): Record<string, string> {
  const actionVersions: Record<string, string> = {};

  const generatedFiles = fs
    .readdirSync(workflowDir)
    .filter((f) => f.startsWith("__") && f.endsWith(".yml"))
    .map((f) => path.join(workflowDir, f));

  for (const filePath of generatedFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    let match: RegExpExecArray | null;

    EXTRACT_ACTION_REF_PATTERN.lastIndex = 0;
    while ((match = EXTRACT_ACTION_REF_PATTERN.exec(content)) !== null) {
      const actionName = match[1];
      const versionWithComment = match[2].trimEnd();

      // Only track non-local actions (those with / but not starting with ./)
      if (!actionName.startsWith("./")) {
        // Assume that version numbers are consistent (this should be the case on a Dependabot update PR)
        actionVersions[actionName] = versionWithComment;
      }
    }
  }

  return actionVersions;
}

/**
 * Update hardcoded action versions in pr-checks/sync.ts
 *
 * @param syncTsPath - Path to sync.ts file
 * @param actionVersions - Map of action names to versions (may include comments)
 * @returns True if the file was modified, false otherwise
 */
export function updateSyncTs(
  syncTsPath: string,
  actionVersions: Record<string, string>,
): boolean {
  if (!fs.existsSync(syncTsPath)) {
    throw new Error(`Could not find ${syncTsPath}`);
  }

  let content = fs.readFileSync(syncTsPath, "utf8");
  const originalContent = content;

  // Update hardcoded action versions
  for (const [actionName, versionWithComment] of Object.entries(
    actionVersions,
  )) {
    // Extract just the version part (before any comment) for sync.ts
    const version = versionWithComment.includes("#")
      ? versionWithComment.split("#")[0].trim()
      : versionWithComment.trim();

    // Update uses of `actionName` for `version`.
    // Note that this will break if we store an Action uses reference in a
    // variable - that's a risk we're happy to take since in that case the
    // PR checks will just fail.
    const pattern = makeReplacementPattern(TS_PATTERN, actionName);
    content = content.replace(pattern, `$1${actionName}@${version}$2`);
  }

  if (content !== originalContent) {
    fs.writeFileSync(syncTsPath, content, "utf8");
    console.info(`Updated ${syncTsPath}`);
    return true;
  } else {
    console.info(`No changes needed in ${syncTsPath}`);
    return false;
  }
}

/**
 * Update action versions in template files in pr-checks/checks/
 *
 * @param checksDir - Path to pr-checks/checks directory
 * @param actionVersions - Map of action names to versions (may include comments)
 * @returns List of files that were modified
 */
export function updateTemplateFiles(
  checksDir: string,
  actionVersions: Record<string, string>,
): string[] {
  const modifiedFiles: string[] = [];

  const templateFiles = fs
    .readdirSync(checksDir)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => path.join(checksDir, f));

  for (const filePath of templateFiles) {
    let content = fs.readFileSync(filePath, "utf8");
    const originalContent = content;

    // Update action versions
    for (const [actionName, versionWithComment] of Object.entries(
      actionVersions,
    )) {
      // Update uses of `actionName` for `versionWithComment`.
      const pattern = makeReplacementPattern(YAML_PATTERN, actionName);
      content = content.replace(pattern, `$1@${versionWithComment}`);
    }

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, "utf8");
      modifiedFiles.push(filePath);
      console.info(`Updated ${filePath}`);
    }
  }

  return modifiedFiles;
}

function main(): number {
  const { values } = parseArgs({
    options: {
      verbose: {
        type: "boolean",
        short: "v",
        default: false,
      },
    },
    strict: true,
  });

  const verbose = values.verbose ?? false;

  console.info("Scanning generated workflows for latest action versions...");
  const actionVersions = scanGeneratedWorkflows(WORKFLOW_DIR);

  if (verbose) {
    console.info("Found action versions:");
    for (const [action, version] of Object.entries(actionVersions)) {
      console.info(`  ${action}@${version}`);
    }
  }

  if (Object.keys(actionVersions).length === 0) {
    console.error("No action versions found in generated workflows");
    return 1;
  }

  // Update files
  console.info("\nUpdating source files...");
  const modifiedFiles: string[] = [];

  // Update sync.ts
  if (updateSyncTs(SYNC_TS_PATH, actionVersions)) {
    modifiedFiles.push(SYNC_TS_PATH);
  }

  // Update template files
  const templateModified = updateTemplateFiles(CHECKS_DIR, actionVersions);
  modifiedFiles.push(...templateModified);

  if (modifiedFiles.length > 0) {
    console.info(`\nSync completed. Modified ${modifiedFiles.length} files:`);
    for (const filePath of modifiedFiles) {
      console.info(`  ${filePath}`);
    }
  } else {
    console.info(
      "\nNo files needed updating - all action versions are already in sync",
    );
  }

  return 0;
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  process.exit(main());
}
