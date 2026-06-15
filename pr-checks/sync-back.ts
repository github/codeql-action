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

import * as fs from "fs";
import { parseArgs } from "node:util";
import * as path from "path";

const THIS_DIR = __dirname;
const CHECKS_DIR = path.join(THIS_DIR, "checks");
const WORKFLOW_DIR = path.join(THIS_DIR, "..", ".github", "workflows");
const SYNC_TS_PATH = path.join(THIS_DIR, "sync.ts");

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

    // Find all action uses in the file, including potential comments
    // This pattern captures: action_name@version_with_possible_comment
    const pattern = /uses:\s+([^/\s]+\/[^@\s]+)@([^@\n]+)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
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
 * Handles both inline `uses: "owner/action@ref"` strings and SHA-pinned
 * references expressed via the `pinnedUses("owner/action", "<sha>", "version")`
 * helper.
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
    // Split the scanned value into the ref (e.g. a commit SHA) and the optional
    // trailing version comment (e.g. `v6.0.3`).
    const ref = versionWithComment.includes("#")
      ? versionWithComment.split("#")[0].trim()
      : versionWithComment.trim();
    const versionComment = versionWithComment.includes("#")
      ? versionWithComment.split("#")[1].trim()
      : "";

    const escaped = actionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Look for patterns like uses: "actions/setup-node@v4"
    // Note that this will break if we store an Action uses reference in a
    // variable - that's a risk we're happy to take since in that case the
    // PR checks will just fail.
    const usesPattern = new RegExp(`(uses:\\s*")${escaped}@(?:[^"]+)(")`, "g");
    content = content.replace(usesPattern, `$1${actionName}@${ref}$2`);

    // Look for SHA-pinned references expressed via the `pinnedUses` helper, e.g.
    // `pinnedUses("actions/checkout", "<sha>", "v6.0.3")`, updating both the
    // pinned ref and the version comment.
    const pinnedPattern = new RegExp(
      `(pinnedUses\\(\\s*")${escaped}("\\s*,\\s*")[^"]*("\\s*,\\s*")([^"]*)(")`,
      "g",
    );
    content = content.replace(
      pinnedPattern,
      (_match, p1, p2, p3, oldVersion, p5) =>
        `${p1}${actionName}${p2}${ref}${p3}${versionComment || oldVersion}${p5}`,
    );
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
      // Look for patterns like 'uses: actions/setup-node@v4' or 'uses: actions/setup-node@sha # comment'
      const escaped = actionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(uses:\\s+${escaped})@(?:[^@\n]+)`, "g");
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
