import * as fs from "fs";
import * as path from "path";

import * as actionsUtil from "./actions-util";
import { Logger } from "./logging";

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
