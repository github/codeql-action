import * as fs from "fs";

import { Logger } from "../logging";

import * as sarif from "sarif";

export type * from "sarif";

// `automationId` is non-standard.
export type RunKey = sarif.ToolComponent & {
  automationId: string | undefined;
};

/**
 * An error that occurred due to an invalid SARIF upload request.
 */
export class InvalidSarifUploadError extends Error {}

/**
 * Get the array of all the tool names contained in the given sarif contents.
 *
 * Returns an array of unique string tool names.
 */
export function getToolNames(sarifFile: sarif.Log): string[] {
  const toolNames = {};

  for (const run of sarifFile.runs || []) {
    const tool = run.tool || {};
    const driver = tool.driver || {};
    if (typeof driver.name === "string" && driver.name.length > 0) {
      toolNames[driver.name] = true;
    }
  }

  return Object.keys(toolNames);
}

export function readSarifFile(sarifFilePath: string): sarif.Log {
  return JSON.parse(fs.readFileSync(sarifFilePath, "utf8")) as sarif.Log;
}

// Takes a list of paths to sarif files and combines them together,
// returning the contents of the combined sarif file.
export function combineSarifFiles(
  sarifFiles: string[],
  logger: Logger,
): sarif.Log {
  logger.info(`Loading SARIF file(s)`);
  const combinedSarif: sarif.Log = {
    version: "2.1.0",
    runs: [],
  };

  for (const sarifFile of sarifFiles) {
    logger.debug(`Loading SARIF file: ${sarifFile}`);
    const sarifObject = readSarifFile(sarifFile);
    // Check SARIF version
    if (combinedSarif.version === null) {
      combinedSarif.version = sarifObject.version;
    } else if (combinedSarif.version !== sarifObject.version) {
      throw new InvalidSarifUploadError(
        `Different SARIF versions encountered: ${combinedSarif.version} and ${sarifObject.version}`,
      );
    }

    combinedSarif.runs.push(...sarifObject.runs);
  }

  return combinedSarif;
}

/**
 * Checks whether all the runs in the given SARIF files were produced by CodeQL.
 * @param sarifObjects The list of SARIF objects to check.
 */
export function areAllRunsProducedByCodeQL(sarifObjects: sarif.Log[]): boolean {
  return sarifObjects.every((sarifObject) => {
    return sarifObject.runs?.every(
      (run) => run.tool?.driver?.name === "CodeQL",
    );
  });
}

function createRunKey(run: sarif.Run): RunKey {
  return {
    name: run.tool?.driver?.name,
    fullName: run.tool?.driver?.fullName,
    version: run.tool?.driver?.version,
    semanticVersion: run.tool?.driver?.semanticVersion,
    guid: run.tool?.driver?.guid,
    automationId: run.automationDetails?.id,
  };
}

/**
 * Checks whether all runs in the given SARIF files are unique (based on the
 * criteria used by Code Scanning to determine analysis categories).
 * @param sarifObjects The list of SARIF objects to check.
 */
export function areAllRunsUnique(sarifObjects: sarif.Log[]): boolean {
  const keys = new Set<string>();

  for (const sarifObject of sarifObjects) {
    for (const run of sarifObject.runs) {
      const key = JSON.stringify(createRunKey(run));

      // If the key already exists, the runs are not unique.
      if (keys.has(key)) {
        return false;
      }

      keys.add(key);
    }
  }

  return true;
}
