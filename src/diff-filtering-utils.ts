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
