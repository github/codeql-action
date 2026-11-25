#!/usr/bin/env npx tsx

/**
 * Checks the changes that a gh-aw agentic workflow is about to push, and fails if they add, delete
 * or replace a workflow, or change anything in an existing workflow apart from its jobs, comments
 * and formatting. Workflows that run on a push don't wait for a maintainer to approve them, so
 * this stops the changes adding a workflow, or a trigger to an existing one, that runs when they're
 * pushed.
 *
 * Usage: check-workflow-changes.ts <directory>
 *
 * The directory is expected to contain gh-aw's `aw-*.bundle` and `aw-*.patch` files, with changes
 * based on the commit that's checked out in the current directory.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";

import * as yaml from "yaml";

/** The directory that GitHub Actions reads workflows from. */
const WORKFLOWS_DIR = ".github/workflows";

/**
 * A change to a file in {@link WORKFLOWS_DIR}. Changes other than modifying a file, such as adding
 * or deleting it, have the kind `other` and the status that `git diff --name-status` reports.
 */
export type WorkflowChange =
  | { kind: "modified"; path: string; before: string; after: string }
  | { kind: "other"; path: string; status: string };

/**
 * Parses `content` as a workflow and returns everything apart from its jobs.
 *
 * @throws If `content` isn't valid YAML.
 */
function parseWithoutJobs(content: string): unknown {
  const workflow: unknown = yaml.parse(content);
  if (
    typeof workflow !== "object" ||
    workflow === null ||
    Array.isArray(workflow)
  ) {
    return workflow;
  }
  return Object.fromEntries(
    Object.entries(workflow).filter(([key]) => key !== "jobs"),
  );
}

/**
 * Finds the changes that aren't allowed. The only changes allowed are modifications to workflows
 * that don't change anything apart from their jobs once parsed, which includes changes to comments
 * and formatting.
 *
 * @returns A description of each change that isn't allowed.
 */
export function findDisallowedChanges(changes: WorkflowChange[]): string[] {
  const problems: string[] = [];
  for (const change of changes) {
    switch (change.kind) {
      case "modified": {
        // The workflows in the base commit are expected to be valid.
        const before = parseWithoutJobs(change.before);
        let after: unknown;
        try {
          after = parseWithoutJobs(change.after);
        } catch (error) {
          problems.push(
            `'${change.path}' isn't valid YAML after the changes: ${String(error)}`,
          );
          break;
        }
        if (!isDeepStrictEqual(before, after)) {
          problems.push(
            `The changes to '${change.path}' affect more than the workflow's jobs.`,
          );
        }
        break;
      }
      case "other":
        problems.push(
          `The changes add, delete or replace '${change.path}' (git status '${change.status}'), but they can only modify the jobs of existing workflows.`,
        );
        break;
    }
  }
  return problems;
}

/** Runs git in the current directory with `args`, and returns its standard output. */
function git(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync("git", args, { encoding: "utf8", env });
}

/**
 * Adds the objects in a git bundle to the repository.
 *
 * @returns The commits that the bundle's refs point to.
 */
function unbundle(bundle: string): string[] {
  // Each line of output is a commit followed by the name of the ref that points to it.
  return git(["bundle", "unbundle", bundle])
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(" ")[0]);
}

/**
 * Applies a patch to `base` in a temporary index, leaving the repository's index and working tree
 * unchanged.
 *
 * @returns The tree that results from applying the patch.
 */
function applyPatch(patch: string, base: string): string {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "check-workflow-changes-"),
  );
  try {
    const env = { ...process.env, GIT_INDEX_FILE: path.join(tempDir, "index") };
    git(["read-tree", base], env);
    git(["apply", "--cached", patch], env);
    return git(["write-tree"], env).trim();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Gets the changes to files in {@link WORKFLOWS_DIR} between two commits or trees. */
function getWorkflowChanges(base: string, tip: string): WorkflowChange[] {
  // With `-z`, the status and path of each change are separate NUL-terminated fields.
  const fields = git([
    "diff",
    "--name-status",
    "--no-renames",
    "-z",
    base,
    tip,
    "--",
    WORKFLOWS_DIR,
  ]).split("\0");
  const changes: WorkflowChange[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const status = fields[i];
    const file = fields[i + 1];
    if (status === "M") {
      changes.push({
        kind: "modified",
        path: file,
        before: git(["show", `${base}:${file}`]),
        after: git(["show", `${tip}:${file}`]),
      });
    } else {
      changes.push({ kind: "other", path: file, status });
    }
  }
  return changes;
}

function main(): number {
  const { positionals } = parseArgs({ allowPositionals: true, strict: true });
  if (positionals.length !== 1) {
    console.error("Usage: check-workflow-changes.ts <directory>");
    return 1;
  }
  const directory = positionals[0];
  const base = git(["rev-parse", "HEAD"]).trim();

  const files = fs
    .readdirSync(directory)
    .filter((name) => /^aw-.*\.(bundle|patch)$/.test(name))
    .sort();
  if (files.length === 0) {
    console.error(`Found no gh-aw bundles or patches in '${directory}'.`);
    return 1;
  }

  const problems: string[] = [];
  for (const name of files) {
    console.info(`Checking the changes to workflows in '${name}'.`);
    const file = path.join(directory, name);
    const tips = name.endsWith(".bundle")
      ? unbundle(file)
      : [applyPatch(file, base)];
    if (tips.length === 0) {
      problems.push(`'${name}' doesn't contain any refs.`);
    }
    for (const tip of tips) {
      problems.push(...findDisallowedChanges(getWorkflowChanges(base, tip)));
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    return 1;
  }
  console.info("The changes to workflows only affect their jobs.");
  return 0;
}

// Node.js versions before 22.18 and 24.2 leave `import.meta.main` undefined, so `main` wouldn't run
// and the check would pass without checking anything.
if (import.meta.main === undefined) {
  throw new Error(
    "This script needs a version of Node.js that sets `import.meta.main`.",
  );
}

// Only call `main` if this script was run directly.
if (import.meta.main) {
  process.exit(main());
}
