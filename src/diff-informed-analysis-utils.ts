import * as fs from "fs";
import * as path from "path";

import * as actionsUtil from "./actions-util";
import type { PullRequestBranches } from "./actions-util";
import { getApiClient, getGitHubVersion } from "./api-client";
import type { CodeQL } from "./codeql";
import { Feature, FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";
import { getRepositoryNwoFromEnv } from "./repository";
import { GitHubVariant, satisfiesGHESVersion } from "./util";

/**
 * This interface is an abbreviated version of the file diff object returned by
 * the GitHub API.
 */
interface FileDiff {
  filename: string;
  changes: number;
  // A patch may be absent if the file is binary, if the file diff is too large,
  // or if the file is unchanged.
  patch?: string | undefined;
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

  const gitHubVersion = await getGitHubVersion();
  if (
    gitHubVersion.type === GitHubVariant.GHES &&
    satisfiesGHESVersion(gitHubVersion.version, "<3.19", true)
  ) {
    return undefined;
  }

  const branches = actionsUtil.getPullRequestBranches();
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

/**
 * Return the file line ranges that were added or modified in the pull request.
 *
 * @param branches The base and head branches of the pull request.
 * @param logger
 * @returns An array of tuples, where each tuple contains the absolute path of a
 * file, the start line and the end line (both 1-based and inclusive) of an
 * added or modified range in that file. Returns `undefined` if the action was
 * not triggered by a pull request or if there was an error.
 */
export async function getPullRequestEditedDiffRanges(
  branches: PullRequestBranches,
  logger: Logger,
): Promise<DiffThunkRange[] | undefined> {
  const fileDiffs = await getFileDiffsWithBasehead(branches, logger);
  if (fileDiffs === undefined) {
    return undefined;
  }
  if (fileDiffs.length >= 300) {
    // The "compare two commits" API returns a maximum of 300 changed files. If
    // we see that many changed files, it is possible that there could be more,
    // with the rest being truncated. In this case, we should not attempt to
    // compute the diff ranges, as the result would be incomplete.
    logger.warning(
      `Cannot retrieve the full diff because there are too many ` +
        `(${fileDiffs.length}) changed files in the pull request.`,
    );
    return undefined;
  }
  const results: DiffThunkRange[] = [];
  for (const filediff of fileDiffs) {
    const diffRanges = getDiffRanges(filediff, logger);
    if (diffRanges === undefined) {
      return undefined;
    }
    results.push(...diffRanges);
  }
  return results;
}

async function getFileDiffsWithBasehead(
  branches: PullRequestBranches,
  logger: Logger,
): Promise<FileDiff[] | undefined> {
  // Check CODE_SCANNING_REPOSITORY first. If it is empty or not set, fall back
  // to GITHUB_REPOSITORY.
  const repositoryNwo = getRepositoryNwoFromEnv(
    "CODE_SCANNING_REPOSITORY",
    "GITHUB_REPOSITORY",
  );
  const basehead = `${branches.base}...${branches.head}`;
  try {
    const response = await getApiClient().rest.repos.compareCommitsWithBasehead(
      {
        owner: repositoryNwo.owner,
        repo: repositoryNwo.repo,
        basehead,
        per_page: 1,
      },
    );
    logger.debug(
      `Response from compareCommitsWithBasehead(${basehead}):` +
        `\n${JSON.stringify(response, null, 2)}`,
    );
    return response.data.files;
  } catch (error: any) {
    if (error.status) {
      logger.warning(`Error retrieving diff ${basehead}: ${error.message}`);
      logger.debug(
        `Error running compareCommitsWithBasehead(${basehead}):` +
          `\nRequest: ${JSON.stringify(error.request, null, 2)}` +
          `\nError Response: ${JSON.stringify(error.response, null, 2)}`,
      );
      return undefined;
    } else {
      throw error;
    }
  }
}

function getDiffRanges(
  fileDiff: FileDiff,
  logger: Logger,
): DiffThunkRange[] | undefined {
  if (fileDiff.patch === undefined) {
    if (fileDiff.changes === 0) {
      // There are situations where a changed file legitimately has no diff.
      // For example, the file may be a binary file, or that the file may have
      // been renamed with no changes to its contents. In these cases, the
      // file would be reported as having 0 changes, and we can return an empty
      // array to indicate no diff range in this file.
      return [];
    }
    // If a file is reported to have nonzero changes but no patch, that may be
    // due to the file diff being too large. In this case, we should fall back
    // to a special diff range that covers the entire file.
    return [
      {
        path: fileDiff.filename,
        startLine: 0,
        endLine: 0,
      },
    ];
  }

  // The 1-based file line number of the current line
  let currentLine = 0;
  // The 1-based file line number that starts the current range of added lines
  let additionRangeStartLine: number | undefined = undefined;
  const diffRanges: DiffThunkRange[] = [];

  const diffLines = fileDiff.patch.split("\n");
  // Adding a fake context line at the end ensures that the following loop will
  // always terminate the last range of added lines.
  diffLines.push(" ");

  for (const diffLine of diffLines) {
    if (diffLine.startsWith("-")) {
      // Ignore deletions completely -- we do not even want to consider them when
      // calculating consecutive ranges of added lines.
      continue;
    }
    if (diffLine.startsWith("+")) {
      if (additionRangeStartLine === undefined) {
        additionRangeStartLine = currentLine;
      }
      currentLine++;
      continue;
    }
    if (additionRangeStartLine !== undefined) {
      // Any line that does not start with a "+" or "-" terminates the current
      // range of added lines.
      diffRanges.push({
        path: fileDiff.filename,
        startLine: additionRangeStartLine,
        endLine: currentLine - 1,
      });
      additionRangeStartLine = undefined;
    }
    if (diffLine.startsWith("@@ ")) {
      // A new hunk header line resets the current line number.
      const match = diffLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match === null) {
        logger.warning(
          `Cannot parse diff hunk header for ${fileDiff.filename}: ${diffLine}`,
        );
        return undefined;
      }
      currentLine = parseInt(match[1], 10);
      continue;
    }
    if (diffLine.startsWith(" ")) {
      // An unchanged context line advances the current line number.
      currentLine++;
      continue;
    }
  }
  return diffRanges;
}

export const exportedForTesting = {
  getDiffRanges,
};
