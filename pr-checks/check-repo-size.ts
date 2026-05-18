#!/usr/bin/env npx tsx

/*
Measures the difference in the `.tar.gz`'d checkout size of the repo between the PR head and the PR
base. This size is relevant because it corresponds to the duration of the "Download action
repository" step that happens at the start of every job that uses this Action.

Writes the candidate sticky-comment body and a small metadata file to `--output-dir`. A separate
workflow job consumes those artifacts and decides whether to create or update a PR comment.
*/

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";

/** Hidden marker used to find the existing sticky comment on a PR. */
export const COMMENT_MARKER = "<!-- repo-size-diff-bot -->";

export const DEFAULT_BASE_REF = "main";

/**
 * Fraction of the base archive size at which a delta is considered significant enough to warrant
 * a new sticky comment. We always update an existing comment regardless, so the comment stays in
 * sync as the diff evolves.
 */
export const SIGNIFICANT_DELTA_FRACTION = 0.1;

/**
 * Stream `git archive --format=tar.gz <ref>` and count the compressed bytes.
 *
 * `git archive` only includes tracked files, so untracked directories like `node_modules` and
 * `build` aren't counted in the size downloaded when starting up a CodeQL job.
 */
export async function measureArchiveSize(
  ref: string,
  cwd: string,
): Promise<number> {
  const git = spawn("git", ["archive", "--format=tar.gz", ref], { cwd });

  let stderr = "";
  git.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  let size = 0;
  git.stdout.on("data", (chunk: Buffer) => {
    size += chunk.length;
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    git.on("error", reject);
    git.on("close", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(
      `git archive ${ref} exited with code ${exitCode}: ${stderr.trim()}`,
    );
  }
  return size;
}

/**
 * Format a byte count into a human-readable string with binary units. If `signed` is true, a
 * leading `+` is prepended for non-negative values so gains and losses are visually distinct.
 */
export function formatBytes(bytes: number, signed = false): string {
  const sign = bytes < 0 ? "-" : signed ? "+" : "";
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(2)} KiB`;
  return `${sign}${(abs / 1024 / 1024).toFixed(2)} MiB`;
}

/** Format a fraction as a signed percentage with 2 decimal places. */
export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export interface CommentBodyOptions {
  baseRef: string;
  baseSize: number;
  prSize: number;
  /** Optional URL of the workflow run, included in the comment footer. */
  runUrl?: string;
}

export function buildCommentBody(opts: CommentBodyOptions): string {
  const { baseRef, baseSize, prSize, runUrl } = opts;
  const delta = prSize - baseSize;
  const signedDelta = delta >= 0 ? `+${delta}` : `${delta}`;
  const runUrlLine = runUrl
    ? ` See the [workflow run](${runUrl}) for details.`
    : "";

  return [
    COMMENT_MARKER,
    "### Repository checkout size",
    "",
    "| | Compressed archive size |",
    "|---|---|",
    `| Base (\`${baseRef}\`) | ${formatBytes(baseSize)} (${baseSize} bytes) |`,
    `| This PR | ${formatBytes(prSize)} (${prSize} bytes) |`,
    `| **Delta** | **${formatBytes(delta, true)} (${signedDelta} bytes, ${formatPercent(delta / baseSize)})** |`,
    "",
    "Sizes are measured by streaming `git archive --format=tar.gz <ref>`, " +
      "which includes tracked files and excludes untracked files such as " +
      "`node_modules`. The compressed checkout is " +
      "downloaded by every consumer of this Action, so changes here directly " +
      `affect Action download time.${runUrlLine}`,
  ].join("\n");
}

/**
 * Returns true when the absolute delta is at least `fraction` of the base size. Both increases and
 * decreases are considered significant, so we report wins as well as losses.
 */
export function isDeltaSignificant(
  delta: number,
  baseSize: number,
  fraction: number,
): boolean {
  return Math.abs(delta) >= baseSize * fraction;
}

interface MainArgs {
  /** Base ref of the PR. Defaults to `main`. Used as the label in the PR comment. */
  baseRef: string;
  /** Base commit-ish to archive. Defaults to `origin/<baseRef>` for local runs. */
  baseCommitish: string;
  /** Optional URL of the workflow run, surfaced in the comment footer. */
  runUrl?: string;
  /** Directory where `body.md` and `metadata.json` are written. */
  outputDir: string;
}

export function readArgs(): MainArgs {
  const { values } = parseArgs({
    options: {
      "output-dir": { type: "string" },
    },
    strict: true,
  });

  const outputDir = values["output-dir"];
  if (!outputDir) {
    throw new Error("--output-dir is required");
  }

  const baseRef = process.env.BASE_REF ?? DEFAULT_BASE_REF;
  const baseCommitish = process.env.BASE_SHA ?? `origin/${baseRef}`;

  return {
    baseRef,
    baseCommitish,
    runUrl: process.env.RUN_URL,
    outputDir,
  };
}

async function main(): Promise<number> {
  const args = readArgs();

  // The script lives at `<repoRoot>/pr-checks/check-repo-size.ts`, so the repo root is the parent
  // directory.
  const repoRoot = path.resolve(__dirname, "..");

  console.log(`Measuring base archive size for ${args.baseCommitish}...`);
  const baseSize = await measureArchiveSize(args.baseCommitish, repoRoot);
  console.log(`  ${baseSize} bytes`);

  console.log("Measuring PR archive size for HEAD...");
  const prSize = await measureArchiveSize("HEAD", repoRoot);
  console.log(`  ${prSize} bytes`);

  const delta = prSize - baseSize;
  const significant = isDeltaSignificant(
    delta,
    baseSize,
    SIGNIFICANT_DELTA_FRACTION,
  );
  console.log(
    `Delta: ${delta} bytes (significant=${significant}, threshold=${(
      SIGNIFICANT_DELTA_FRACTION * 100
    ).toFixed(2)}%)`,
  );

  const body = buildCommentBody({
    baseRef: args.baseRef,
    baseSize,
    prSize,
    runUrl: args.runUrl,
  });

  fs.mkdirSync(args.outputDir, { recursive: true });
  fs.writeFileSync(path.join(args.outputDir, "body.md"), body);
  fs.writeFileSync(
    path.join(args.outputDir, "metadata.json"),
    `${JSON.stringify(
      { significant, baseRef: args.baseRef, baseSize, prSize, delta },
      null,
      2,
    )}\n`,
  );
  console.log(`Wrote body.md and metadata.json to ${args.outputDir}.`);
  return 0;
}

if (require.main === module) {
  void (async () => {
    try {
      process.exit(await main());
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  })();
}
