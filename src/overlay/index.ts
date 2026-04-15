import * as fs from "fs";
import * as path from "path";

import * as actionsUtil from "../actions-util";
import { getOptionalInput, getTemporaryDirectory } from "../actions-util";
import { type Config } from "../config-utils";
import { getFileOidsUnderPath, getGitRoot } from "../git-utils";
import { Logger } from "../logging";
import { getBaseDatabaseOidsFilePath } from "../util";

export const CODEQL_OVERLAY_MINIMUM_VERSION = "2.23.8";

// Per-language minimum CLI versions for overlay analysis, based on release
// validation data.
export const CODEQL_OVERLAY_MINIMUM_VERSION_CPP = "2.25.0";
export const CODEQL_OVERLAY_MINIMUM_VERSION_CSHARP = "2.24.1";
export const CODEQL_OVERLAY_MINIMUM_VERSION_GO = "2.24.2";
export const CODEQL_OVERLAY_MINIMUM_VERSION_JAVA = "2.23.8";
export const CODEQL_OVERLAY_MINIMUM_VERSION_JAVASCRIPT = "2.23.9";
export const CODEQL_OVERLAY_MINIMUM_VERSION_PYTHON = "2.23.9";
export const CODEQL_OVERLAY_MINIMUM_VERSION_RUBY = "2.23.9";

/**
 * Writes a JSON file containing Git OIDs for all tracked files (represented
 * by path relative to the source root) under the source root. The file is
 * written into the database location specified in the config.
 *
 * @param config The configuration object containing the database location
 * @param sourceRoot The root directory containing the source files to process
 * @throws {Error} If the Git repository root cannot be determined
 */
export async function writeBaseDatabaseOidsFile(
  config: Config,
  sourceRoot: string,
): Promise<void> {
  const gitFileOids = await getFileOidsUnderPath(sourceRoot);
  const gitFileOidsJson = JSON.stringify(gitFileOids);
  const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
  await fs.promises.writeFile(baseDatabaseOidsFilePath, gitFileOidsJson);
}

/**
 * Reads and parses the JSON file containing the base database Git OIDs.
 * This file contains the mapping of file paths to their corresponding Git OIDs
 * that was previously written by writeBaseDatabaseOidsFile().
 *
 * @param config The configuration object containing the database location
 * @param logger The logger instance to use for error reporting
 * @returns An object mapping file paths (relative to source root) to their Git OIDs
 * @throws {Error} If the file cannot be read or parsed
 */
async function readBaseDatabaseOidsFile(
  config: Config,
  logger: Logger,
): Promise<{ [key: string]: string }> {
  const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
  try {
    const contents = await fs.promises.readFile(
      baseDatabaseOidsFilePath,
      "utf-8",
    );
    return JSON.parse(contents) as { [key: string]: string };
  } catch (e) {
    logger.error(
      "Failed to read overlay-base file OIDs from " +
        `${baseDatabaseOidsFilePath}: ${(e as any).message || e}`,
    );
    throw e;
  }
}

/**
 * Writes a JSON file containing the source-root-relative paths of files under
 * `sourceRoot` that have changed (added, removed, or modified) from the overlay
 * base database.
 *
 * This function uses the Git index to determine which files have changed, so it
 * requires the following preconditions, both when this function is called and
 * when the overlay-base database was initialized:
 *
 * - It requires that `sourceRoot` is inside a Git repository.
 * - It assumes that all changes in the working tree are staged in the index.
 * - It assumes that all files of interest are tracked by Git, e.g. not covered
 *   by `.gitignore`.
 */
export async function writeOverlayChangesFile(
  config: Config,
  sourceRoot: string,
  logger: Logger,
): Promise<string> {
  const baseFileOids = await readBaseDatabaseOidsFile(config, logger);
  const overlayFileOids = await getFileOidsUnderPath(sourceRoot);
  const oidChangedFiles = computeChangedFiles(baseFileOids, overlayFileOids);
  logger.info(
    `Found ${oidChangedFiles.length} changed file(s) under ${sourceRoot} from OID comparison.`,
  );

  // Merge in any file paths from precomputed PR diff ranges to ensure the
  // overlay always includes all files from the PR diff, even in edge cases
  // like revert PRs where OID comparison shows no change.
  const diffRangeFiles = await getDiffRangeFilePaths(sourceRoot, logger);
  const changedFiles = [...new Set([...oidChangedFiles, ...diffRangeFiles])];

  const changedFilesJson = JSON.stringify({ changes: changedFiles });
  const overlayChangesFile = path.join(
    getTemporaryDirectory(),
    "overlay-changes.json",
  );
  logger.debug(
    `Writing overlay changed files to ${overlayChangesFile}: ${changedFilesJson}`,
  );
  await fs.promises.writeFile(overlayChangesFile, changedFilesJson);
  return overlayChangesFile;
}

function computeChangedFiles(
  baseFileOids: { [key: string]: string },
  overlayFileOids: { [key: string]: string },
): string[] {
  const changes: string[] = [];
  for (const [file, oid] of Object.entries(overlayFileOids)) {
    if (!(file in baseFileOids) || baseFileOids[file] !== oid) {
      changes.push(file);
    }
  }
  for (const file of Object.keys(baseFileOids)) {
    if (!(file in overlayFileOids)) {
      changes.push(file);
    }
  }
  return changes;
}

async function getDiffRangeFilePaths(
  sourceRoot: string,
  logger: Logger,
): Promise<string[]> {
  const jsonFilePath = actionsUtil.getDiffRangesJsonFilePath();

  if (!fs.existsSync(jsonFilePath)) {
    logger.debug(
      `No diff ranges JSON file found at ${jsonFilePath}; skipping.`,
    );
    return [];
  }

  let contents: string;
  try {
    contents = await fs.promises.readFile(jsonFilePath, "utf8");
  } catch (e) {
    logger.warning(
      `Failed to read diff ranges JSON file at ${jsonFilePath}: ${e}`,
    );
    return [];
  }

  let diffRanges: Array<{ path: string }>;
  try {
    diffRanges = JSON.parse(contents) as Array<{ path: string }>;
  } catch (e) {
    logger.warning(
      `Failed to parse diff ranges JSON file at ${jsonFilePath}: ${e}`,
    );
    return [];
  }
  logger.debug(
    `Read ${diffRanges.length} diff range(s) from ${jsonFilePath} for overlay changes.`,
  );

  // Diff-range paths are relative to the repo root (from the GitHub compare
  // API), but overlay changed files must be relative to sourceRoot (to match
  // getFileOidsUnderPath output). Convert and filter accordingly.
  const repoRoot = await getGitRoot(sourceRoot);
  if (repoRoot === undefined) {
    if (getOptionalInput("source-root")) {
      throw new Error(
        "Cannot determine git root to convert diff range paths relative to source-root. " +
          "Failing to avoid omitting files from the analysis.",
      );
    }
    logger.warning(
      "Cannot determine git root; returning diff range paths as-is.",
    );
    return [...new Set(diffRanges.map((r) => r.path))];
  }

  const relativePaths = diffRanges
    .map((r) =>
      path
        .relative(sourceRoot, path.join(repoRoot, r.path))
        .replaceAll(path.sep, "/"),
    )
    .filter((rel) => !rel.startsWith(".."));
  return [...new Set(relativePaths)];
}
