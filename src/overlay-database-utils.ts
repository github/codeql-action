import * as fs from "fs";
import * as path from "path";

import { getTemporaryDirectory } from "./actions-util";
import { type Config } from "./config-utils";
import { getAllFileOids, getGitRoot } from "./git-utils";
import { Logger } from "./logging";
import { pathStartsWith } from "./util";

export enum OverlayDatabaseMode {
  Overlay = "overlay",
  OverlayBase = "overlay-base",
  None = "none",
}

export const CODEQL_OVERLAY_MINIMUM_VERSION = "2.20.5";

export async function writeBaseDatabaseOidsFile(
  config: Config,
  sourceRoot: string,
): Promise<void> {
  const gitFileOids = await getAllFileOids(sourceRoot);
  const gitFileOidsJson = JSON.stringify(gitFileOids);
  const baseDatabaseOidsFilePath = getBaseDatabaseOidsFilePath(config);
  await fs.promises.writeFile(baseDatabaseOidsFilePath, gitFileOidsJson);
}

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
 * Writes a JSON file containing the absolute paths of files under `sourceRoot`
 * that have changed (added, removed, or modified) relative to the overlay base
 * database.
 *
 * This function uses the Git index to determine which files have changed, so it
 * has a few limitations:
 *
 * - It requires that `sourceRoot` is inside a Git repository.
 * - It only works for files tracked by the Git repository that `sourceRoot` is
 *   in. If the Git repository has submodules, this function will not detect
 *   changes in those submodules.
 * - It assumes that the Git repository is in a clean state, i.e. there are no
 *   uncommitted changes in the repository.
 * - It assumes that all files of interest are tracked by Git, e.g. not covered
 *   by `.gitignore`.
 */
export async function writeOverlayChangedFilesFile(
  config: Config,
  sourceRoot: string,
  logger: Logger,
): Promise<string> {
  const gitRoot = await getGitRoot(sourceRoot);
  if (!gitRoot) {
    throw new Error("Failed to determine Git repository root");
  }

  const baseFileOids = await readBaseDatabaseOidsFile(config, logger);
  const overlayFileOids = await getAllFileOids(sourceRoot);
  const gitChangedFiles = computeChangedFiles(baseFileOids, overlayFileOids);

  const overlayChangedFiles: string[] = [];
  for (const pathInRepo of gitChangedFiles) {
    const absolutePath = path.join(gitRoot, pathInRepo);
    if (pathStartsWith(absolutePath, sourceRoot)) {
      overlayChangedFiles.push(absolutePath);
    }
  }
  logger.info(
    `Found ${overlayChangedFiles.length} changed file(s) ` +
      `under ${sourceRoot}.`,
  );

  const changedFilesJson = JSON.stringify(overlayChangedFiles);
  const overlayChangedFilesFilePath = path.join(
    getTemporaryDirectory(),
    "overlay-changed-files.json",
  );
  logger.debug(
    "Writing overlay changed files to " +
      `${overlayChangedFilesFilePath}: ${changedFilesJson}`,
  );
  await fs.promises.writeFile(overlayChangedFilesFilePath, changedFilesJson);
  return overlayChangedFilesFilePath;
}

function getBaseDatabaseOidsFilePath(config: Config): string {
  return path.join(config.dbLocation, "base-database-oids.json");
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
