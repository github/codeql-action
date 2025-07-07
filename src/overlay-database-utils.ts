import * as fs from "fs";
import * as path from "path";

import { getTemporaryDirectory } from "./actions-util";
import { type Config } from "./config-utils";
import { getFileOidsUnderPath } from "./git-utils";
import { Logger } from "./logging";

export enum OverlayDatabaseMode {
  Overlay = "overlay",
  OverlayBase = "overlay-base",
  None = "none",
}

export const CODEQL_OVERLAY_MINIMUM_VERSION = "2.20.5";

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

function getBaseDatabaseOidsFilePath(config: Config): string {
  return path.join(config.dbLocation, "base-database-oids.json");
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
  const changedFiles = computeChangedFiles(baseFileOids, overlayFileOids);
  logger.info(
    `Found ${changedFiles.length} changed file(s) under ${sourceRoot}.`,
  );

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
