import * as fs from "fs";
import * as path from "path";

import * as github from "@actions/github";

import * as actionsUtil from "./actions-util";
import type { CodeQL } from "./codeql";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";

export interface PullRequestBranches {
  base: string;
  head: string;
}

function getPullRequestBranches(): PullRequestBranches | undefined {
  const pullRequest = github.context.payload.pull_request;
  if (pullRequest) {
    return {
      base: pullRequest.base.ref,
      // We use the head label instead of the head ref here, because the head
      // ref lacks owner information and by itself does not uniquely identify
      // the head branch (which may be in a forked repository).
      head: pullRequest.head.label,
    };
  }

  // PR analysis under Default Setup does not have the pull_request context,
  // but it should set CODE_SCANNING_REF and CODE_SCANNING_BASE_BRANCH.
  const codeScanningRef = process.env.CODE_SCANNING_REF;
  const codeScanningBaseBranch = process.env.CODE_SCANNING_BASE_BRANCH;
  if (codeScanningRef && codeScanningBaseBranch) {
    return {
      base: codeScanningBaseBranch,
      // PR analysis under Default Setup analyzes the PR head commit instead of
      // the merge commit, so we can use the provided ref directly.
      head: codeScanningRef,
    };
  }
  return undefined;
}

/**
 * Check if the action should perform diff-informed analysis.
 */
export async function shouldPerformDiffInformedAnalysis(
  codeql: CodeQL,
  features: FeatureEnablement,
  logger: Logger,
): Promise<boolean> {
  return (
    (await getDiffInformedAnalysisBranches(codeql, features, logger)) !==
    undefined
  );
}

/**
 * Get the branches to use for diff-informed analysis.
 *
 * @returns If the action should perform diff-informed analysis, return
 * the base and head branches that should be used to compute the diff ranges.
 * Otherwise return `undefined`.
 */
export async function getDiffInformedAnalysisBranches(
  codeql: CodeQL,
  features: FeatureEnablement,
  logger: Logger,
): Promise<PullRequestBranches | undefined> {
  if (!(await features.getValue(Feature.DiffInformedQueries, codeql))) {
    return undefined;
  }

  const branches = getPullRequestBranches();
  if (!branches) {
    logger.info(
      "Not performing diff-informed analysis " +
        "because we are not analyzing a pull request.",
    );
  }
  return branches;
}

export interface DiffThunkRange {
  path: string;
  startLine: number;
  endLine: number;
}

function getDiffRangesJsonFilePath(): string {
  return path.join(actionsUtil.getTemporaryDirectory(), "pr-diff-range.json");
}

export function writeDiffRangesJsonFile(
  logger: Logger,
  ranges: DiffThunkRange[],
): void {
  const jsonContents = JSON.stringify(ranges, null, 2);
  const jsonFilePath = getDiffRangesJsonFilePath();
  fs.writeFileSync(jsonFilePath, jsonContents);
  logger.debug(
    `Wrote pr-diff-range JSON file to ${jsonFilePath}:\n${jsonContents}`,
  );
}

export function readDiffRangesJsonFile(
  logger: Logger,
): DiffThunkRange[] | undefined {
  const jsonFilePath = getDiffRangesJsonFilePath();
  if (!fs.existsSync(jsonFilePath)) {
    logger.debug(`Diff ranges JSON file does not exist at ${jsonFilePath}`);
    return undefined;
  }
  const jsonContents = fs.readFileSync(jsonFilePath, "utf8");
  logger.debug(
    `Read pr-diff-range JSON file from ${jsonFilePath}:\n${jsonContents}`,
  );
  return JSON.parse(jsonContents) as DiffThunkRange[];
}
