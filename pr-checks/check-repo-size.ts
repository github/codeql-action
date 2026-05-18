#!/usr/bin/env npx tsx

/*
Computes the difference in the `.tar.gz`'d checkout size of the repo between the PR head and the PR
base, and posts/updates a sticky comment on the PR when the change is significant in either
direction. This size is relevant because it corresponds to the duration of the "Download action
repository" step that happens at the start of every job that uses this Action.

Designed to be invoked from the `Check repo size` workflow on PR events, but also runnable locally
(with --dry-run) for testing.
*/

import { spawn } from "node:child_process";
import * as path from "node:path";
import { parseArgs } from "node:util";

import { type ApiClient, getApiClient } from "./api-client";

/** Hidden marker used to find the existing sticky comment on a PR. */
export const COMMENT_MARKER = "<!-- repo-size-diff-bot -->";

export const DEFAULT_BASE_REF = "main";
export const DEFAULT_REPOSITORY = "github/codeql-action";

/**
 * Fraction of the base archive size at which a delta is considered
 * significant enough to warrant a new sticky comment. We always update an
 * existing comment regardless, so the comment stays in sync as the diff
 * evolves.
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
 * Format a byte count into a human-readable string with binary units. If
 * `signed` is true, a leading `+` is prepended for non-negative values so
 * gains and losses are visually distinct.
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

export interface UpsertOptions {
  client: ApiClient;
  owner: string;
  repo: string;
  prNumber: number;
  body: string;
  delta: number;
  baseSize: number;
}

export type UpsertResult =
  | { action: "updated"; commentId: number }
  | { action: "created"; commentId: number }
  | { action: "skipped"; reason: string };

/**
 * Find an existing sticky comment on the PR by HTML marker. If one exists,
 * always update it (so it stays in sync). Otherwise, only create a new
 * comment when the delta is currently significant.
 */
export async function upsertSizeComment(
  opts: UpsertOptions,
): Promise<UpsertResult> {
  const { client, owner, repo, prNumber, body, delta, baseSize } = opts;

  const comments = await client.paginate(
    "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    },
  );
  const existing = comments.find((c) =>
    (c.body ?? "").includes(COMMENT_MARKER),
  );

  if (existing) {
    await client.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    return { action: "updated", commentId: existing.id };
  }

  if (isDeltaSignificant(delta, baseSize, SIGNIFICANT_DELTA_FRACTION)) {
    const { data } = await client.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    return { action: "created", commentId: data.id };
  }

  return {
    action: "skipped",
    reason:
      `delta ${delta} bytes is below ` +
      `${(SIGNIFICANT_DELTA_FRACTION * 100).toFixed(2)}% of base size ` +
      `${baseSize} bytes`,
  };
}

interface MainArgs {
  /** Base ref of the PR. Defaults to `main`, and is used as the label in the PR comment. */
  baseRef: string;
  /** Base commit to archive. Defaults to `origin/main` for local dry runs. */
  baseCommitish: string;
  /** Numeric PR number used to find / create / update the sticky comment. Required outside dry-run. */
  prNumber?: number;
  /** `owner/repo` slug, defaulting to `github/codeql-action`, split before being passed to Octokit. */
  ownerRepo: string;
  /** Optional URL of the workflow run, surfaced in the comment footer. */
  runUrl?: string;
  /** When true, log the would-be comment instead of calling GitHub. */
  dryRun: boolean;
  /** GitHub token used to authenticate Octokit. Required unless `dryRun` is true. */
  token?: string;
}

export function readArgs(): MainArgs {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
  });

  const dryRun = values["dry-run"] ?? false;
  const baseRef = process.env.BASE_REF ?? DEFAULT_BASE_REF;
  const baseCommitish = process.env.BASE_SHA ?? `origin/${baseRef}`;
  const prNumberStr = process.env.PR_NUMBER;
  const repo = process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;

  let prNumber: number | undefined;
  if (prNumberStr) {
    prNumber = Number.parseInt(prNumberStr, 10);
    if (!Number.isFinite(prNumber)) {
      throw new Error(`Invalid PR_NUMBER value: ${prNumberStr}`);
    }
  } else if (!dryRun) {
    throw new Error("Missing PR_NUMBER env var");
  }

  return {
    baseRef,
    baseCommitish,
    prNumber,
    ownerRepo: repo,
    runUrl: process.env.RUN_URL,
    dryRun,
    token: process.env.GITHUB_TOKEN,
  };
}

async function main(): Promise<number> {
  const args = readArgs();

  // The script lives at `<repoRoot>/pr-checks/check-repo-size.ts`, so the repo
  // root is always the parent directory.
  const repoRoot = path.resolve(__dirname, "..");

  console.log(`Measuring base archive size for ${args.baseCommitish}...`);
  const baseSize = await measureArchiveSize(args.baseCommitish, repoRoot);
  console.log(`  ${baseSize} bytes`);

  console.log("Measuring PR archive size for HEAD...");
  const prSize = await measureArchiveSize("HEAD", repoRoot);
  console.log(`  ${prSize} bytes`);

  const delta = prSize - baseSize;
  console.log(`Delta: ${delta} bytes`);

  const body = buildCommentBody({
    baseRef: args.baseRef,
    baseSize,
    prSize,
    runUrl: args.runUrl,
  });

  if (args.dryRun) {
    const significant = isDeltaSignificant(
      delta,
      baseSize,
      SIGNIFICANT_DELTA_FRACTION,
    );
    console.log(
      `--dry-run: significant=${significant} (threshold ${(
        SIGNIFICANT_DELTA_FRACTION * 100
      ).toFixed(2)}%); would post:\n${body}`,
    );
    return 0;
  }

  if (!args.token) {
    throw new Error(
      "GITHUB_TOKEN env var is required when not running with --dry-run",
    );
  }
  if (args.prNumber === undefined) {
    throw new Error("Missing PR_NUMBER env var");
  }

  const [owner, repo] = args.ownerRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${args.ownerRepo}`);
  }

  const result = await upsertSizeComment({
    client: getApiClient(args.token),
    owner,
    repo,
    prNumber: args.prNumber,
    body,
    delta,
    baseSize,
  });

  switch (result.action) {
    case "updated":
      console.log(`Updated existing comment ${result.commentId}.`);
      break;
    case "created":
      console.log(`Created new comment ${result.commentId}.`);
      break;
    case "skipped":
      console.log(`Skipped commenting: ${result.reason}.`);
      break;
  }
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
