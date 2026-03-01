import * as fs from "fs";

import { Logger } from "../logging";

export interface SarifLocation {
  physicalLocation?: {
    artifactLocation?: {
      uri?: string;
    };
  };
}

export interface SarifNotification {
  locations?: SarifLocation[];
}

export interface SarifInvocation {
  toolExecutionNotifications?: SarifNotification[];
}

export interface SarifResult {
  ruleId?: string;
  rule?: {
    id?: string;
  };
  message?: {
    text?: string;
  };
  locations: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string;
      };
      region?: {
        startLine?: number;
      };
    };
  }>;
  relatedLocations?: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string;
      };
      region?: {
        startLine?: number;
      };
    };
  }>;
  partialFingerprints: {
    primaryLocationLineHash?: string;
  };
}

export interface SarifRun {
  tool?: {
    driver?: {
      guid?: string;
      name?: string;
      fullName?: string;
      semanticVersion?: string;
      version?: string;
    };
  };
  automationDetails?: {
    id?: string;
  };
  artifacts?: string[];
  invocations?: SarifInvocation[];
  results?: SarifResult[];
}

export interface SarifFile {
  version?: string | null;
  runs: SarifRun[];
}

export type SarifRunKey = {
  name: string | undefined;
  fullName: string | undefined;
  version: string | undefined;
  semanticVersion: string | undefined;
  guid: string | undefined;
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
export function getToolNames(sarif: SarifFile): string[] {
  const toolNames = {};

  for (const run of sarif.runs || []) {
    const tool = run.tool || {};
    const driver = tool.driver || {};
    if (typeof driver.name === "string" && driver.name.length > 0) {
      toolNames[driver.name] = true;
    }
  }

  return Object.keys(toolNames);
}

export function readSarifFile(sarifFilePath: string): SarifFile {
  return JSON.parse(fs.readFileSync(sarifFilePath, "utf8")) as SarifFile;
}

// Takes a list of paths to sarif files and combines them together,
// returning the contents of the combined sarif file.
export function combineSarifFiles(
  sarifFiles: string[],
  logger: Logger,
): SarifFile {
  logger.info(`Loading SARIF file(s)`);
  const combinedSarif: SarifFile = {
    version: null,
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
export function areAllRunsProducedByCodeQL(sarifObjects: SarifFile[]): boolean {
  return sarifObjects.every((sarifObject) => {
    return sarifObject.runs?.every(
      (run) => run.tool?.driver?.name === "CodeQL",
    );
  });
}

function createRunKey(run: SarifRun): SarifRunKey {
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
export function areAllRunsUnique(sarifObjects: SarifFile[]): boolean {
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
