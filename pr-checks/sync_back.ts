#!/usr/bin/env npx tsx

import * as yaml from "yaml";

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

/** Records information about the version of an Action with an optional comment. */
type ActionVersion = { version: string; comment?: string };

/** Converts `info` to a string that includes the version and comment. */
function versionWithCommentStr(info: ActionVersion): string {
  const comment = info.comment ? ` #${info.comment}` : "";
  return `${info.version}${comment}`;
}

/**
 * Constructs a `yaml.visitor` which calls `fn` for `yaml.Pair` nodes where the key is "uses" and
 * the value is a `yaml.Scalar`.
 */
function usesVisitor(
  fn: (
    pair: yaml.Pair<yaml.Scalar, yaml.Scalar>,
    actionName: string,
    actionVersion: ActionVersion,
  ) => void,
): yaml.visitor {
  return {
    Pair(_, pair) {
      if (
        yaml.isScalar(pair.key) &&
        yaml.isScalar(pair.value) &&
        pair.key.value === "uses" &&
        typeof pair.value.value === "string"
      ) {
        const usesValue = pair.value.value;

        // Only track non-local actions (those with / but not starting with ./)
        if (!usesValue.startsWith("./")) {
          const parts = (pair.value.value as string).split("@");

          if (parts.length !== 2) {
            throw new Error(`Unexpected 'uses' value: ${usesValue}`);
          }

          const actionName = parts[0];
          const actionVersion = parts[1].trimEnd();
          const comment = pair.value.comment?.trimEnd();

          fn(pair as yaml.Pair<yaml.Scalar, yaml.Scalar>, actionName, {
            version: actionVersion,
            comment,
          });
        }

        // Do not visit the children of this node.
        return yaml.visit.SKIP;
      }

      // Do nothing and continue.
      return undefined;
    },
  };
}

/**
 * Scan generated workflow files to extract the latest action versions.
 *
 * @param workflowDir - Path to .github/workflows directory
 * @returns Map from action names to their latest versions (including comments)
 */
export function scanGeneratedWorkflows(
  workflowDir: string,
): Record<string, ActionVersion> {
  const actionVersions: Record<string, ActionVersion> = {};

  const generatedFiles = fs
    .readdirSync(workflowDir)
    .filter((f) => f.startsWith("__") && f.endsWith(".yml"))
    .map((f) => path.join(workflowDir, f));

  for (const filePath of generatedFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const doc = yaml.parseDocument(content);

    yaml.visit(
      doc,
      usesVisitor((_node, actionName, actionVersion) => {
        // Assume that version numbers are consistent (this should be the case on a Dependabot update PR)
        actionVersions[actionName] = actionVersion;
      }),
    );
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
  actionVersions: Record<string, ActionVersion>,
): boolean {
  if (!fs.existsSync(syncTsPath)) {
    throw new Error(`Could not find ${syncTsPath}`);
  }

  let content = fs.readFileSync(syncTsPath, "utf8");
  const originalContent = content;

  // Update hardcoded action versions
  for (const [actionName, versionInfo] of Object.entries(actionVersions)) {
    // Note that this will break if we store an Action uses reference in a
    // variable - that's a risk we're happy to take since in that case the
    // PR checks will just fail.
    const escaped = actionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(uses:\\s*")${escaped}@(?:[^"]+)(")`, "g");
    content = content.replace(
      pattern,
      `$1${actionName}@${versionInfo.version}$2`,
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
  actionVersions: Record<string, ActionVersion>,
): string[] {
  const modifiedFiles: string[] = [];

  const templateFiles = fs
    .readdirSync(checksDir)
    .filter((f) => f.endsWith(".yml"))
    .map((f) => path.join(checksDir, f));

  for (const filePath of templateFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const doc = yaml.parseDocument(content, { keepSourceTokens: true });
    let modified: boolean = false;

    yaml.visit(
      doc,
      usesVisitor((pair, actionName, actionVersion) => {
        // Try to look up version information for this action.
        const versionInfo = actionVersions[actionName];

        // If we found version information, and the version is different from that in the template,
        // then update the pair node accordingly.
        if (versionInfo && versionInfo.version !== actionVersion.version) {
          pair.value.value = `${actionName}@${versionInfo.version}`;
          pair.value.comment = versionInfo.comment;
          modified = true;
        }
      }),
    );

    // Write the YAML document back to the file if we made changes.
    if (modified) {
      fs.writeFileSync(
        filePath,
        yaml.stringify(doc, { lineWidth: 0, flowCollectionPadding: false }),
        "utf8",
      );
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
      console.info(`  ${action}@${versionWithCommentStr(version)}`);
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
