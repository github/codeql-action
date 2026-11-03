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

import { PR_CHECKS_DIR, REPO_ROOT } from "./config";

const CHECKS_DIR = path.join(PR_CHECKS_DIR, "checks");
const WORKFLOW_DIR = path.join(REPO_ROOT, ".github", "workflows");
const SYNC_TS_PATH = path.join(PR_CHECKS_DIR, "sync.ts");

/** Type alias for action names. */
type ActionName = string;

/** Type alias for action versions. May include a comment. */
type ActionVersion = string;

/** Mappings of {@link ActionName}s to {@link ActionVersion}s. */
type ActionVersions = Record<ActionName, ActionVersion>;

/** Mappings of workflow names to {@link ActionVersions}. */
type ActionVersionsByWorkflow = Record<string, ActionVersions>;

/** The result of {@link scanGeneratedWorkflows}. */
type ScanWorkflowResult = {
  /** A mapping of {@link ActionName}s to all encountered {@link ActionVersion}s. */
  actionVersions: Record<ActionName, Set<ActionVersion>>;

  /** A mapping of workflow names to {@link ActionVersions}. */
  actionVersionsByWorkflow: ActionVersionsByWorkflow;
};

/**
 * Scan generated workflow files to extract the latest action versions.
 *
 * @param workflowDir - Path to .github/workflows directory
 *
 * @returns A {@link ScanWorkflowResult} object containing information about the extracted action versions.
 */
export function scanGeneratedWorkflows(
  workflowDir: string,
): ScanWorkflowResult {
  const actionVersionsByWorkflow: ActionVersionsByWorkflow = {};
  const actionVersions: Record<ActionName, Set<ActionVersion>> = {};

  const generatedFiles = fs
    .readdirSync(workflowDir)
    .filter((f) => f.startsWith("__") && f.endsWith(".yml"))
    .map((f) => path.join(workflowDir, f));

  for (const filePath of generatedFiles) {
    const content = fs.readFileSync(filePath, "utf8");

    // Get the basename of the workflow and drop the leading `__` from it.
    const workflowName = path.basename(filePath).slice(2);
    actionVersionsByWorkflow[workflowName] = {};

    // Find all action uses in the file, including potential comments
    // This pattern captures: action_name@version_with_possible_comment
    const pattern = /uses:\s+([^/\s]+\/[^@\s]+)@([^@\n]+)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const actionName = match[1];
      const versionWithComment = match[2].trimEnd();

      // Only track non-local actions (those with / but not starting with ./)
      if (!actionName.startsWith("./")) {
        // Record the version of the action for this workflow.
        actionVersionsByWorkflow[workflowName][actionName] = versionWithComment;

        // Record this version for the action so that we can write it to `sync.ts` if needed.
        // Usually we'd expect there to be exactly one version per action across all workflows,
        // but sometimes these can go out-of-sync if e.g. a workflow is added in a branch and a
        // Dependabot PR is merged in the meantime that changes the version of an action that is
        // used in the new workflow. Different versions of the same action across different
        // workflows is not fundamentally a problem, but we may need to pick one for `sync.ts`
        // so we warn there if we have multiple versions of an action.
        if (actionVersions[actionName] === undefined) {
          actionVersions[actionName] = new Set([versionWithComment]);
        } else if (!actionVersions[actionName].has(versionWithComment)) {
          actionVersions[actionName].add(versionWithComment);
        }
      }
    }
  }

  return { actionVersions, actionVersionsByWorkflow };
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
  actionVersions: Record<ActionName, Set<ActionVersion>>,
): boolean {
  if (!fs.existsSync(syncTsPath)) {
    throw new Error(`Could not find ${syncTsPath}`);
  }

  let content = fs.readFileSync(syncTsPath, "utf8");
  const originalContent = content;

  // Update hardcoded action versions
  for (const [actionName, versionsWithComments] of Object.entries(
    actionVersions,
  )) {
    // We usually expect `versionsWithComments` to contain one version. If there are multiple,
    // we arbitrarily pick one and warn about it.
    const versionsWithCommentsArray = Array.from(versionsWithComments);
    const versionWithComment = versionsWithCommentsArray[0];
    if (versionsWithComments.size > 1) {
      console.warn(
        `Inconsistent versions for ${actionName}. Arbitrarily picking '${versionWithComment}'. All found: ${versionsWithCommentsArray.join(", ")}`,
      );
    }
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
 * @param actionVersionsByWorkflow - Map of workflows to maps of action names to versions (may include comments)
 * @returns List of files that were modified
 */
export function updateTemplateFiles(
  checksDir: string,
  actionVersionsByWorkflow: ActionVersionsByWorkflow,
): string[] {
  const modifiedFiles: string[] = [];

  const templateFiles = fs
    .readdirSync(checksDir)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => path.join(checksDir, f));

  for (const filePath of templateFiles) {
    let content = fs.readFileSync(filePath, "utf8");
    const originalContent = content;

    const workflowName = path.basename(filePath);
    const actionVersions = actionVersionsByWorkflow[workflowName];

    if (actionVersions === undefined) {
      console.info(
        `Found no action versions for workflow template '${filePath}'.`,
      );
      continue;
    }

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
  const { actionVersions, actionVersionsByWorkflow } =
    scanGeneratedWorkflows(WORKFLOW_DIR);

  if (verbose) {
    console.info("Found action versions:");
    for (const [action, versions] of Object.entries(actionVersions)) {
      for (const version of versions) {
        console.info(`  ${action}@${version}`);
      }
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
  const templateModified = updateTemplateFiles(
    CHECKS_DIR,
    actionVersionsByWorkflow,
  );
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
if (import.meta.main) {
  process.exit(main());
}
