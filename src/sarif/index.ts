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

export function removeDuplicateLocations(
  locations: SarifLocation[],
): SarifLocation[] {
  const newJsonLocations = new Set<string>();
  return locations.filter((location) => {
    const jsonLocation = JSON.stringify(location);
    if (!newJsonLocations.has(jsonLocation)) {
      newJsonLocations.add(jsonLocation);
      return true;
    }
    return false;
  });
}

export function fixInvalidNotifications(
  sarif: SarifFile,
  logger: Logger,
): SarifFile {
  if (!Array.isArray(sarif.runs)) {
    return sarif;
  }

  // Ensure that the array of locations for each SARIF notification contains unique locations.
  // This is a workaround for a bug in the CodeQL CLI that causes duplicate locations to be
  // emitted in some cases.
  let numDuplicateLocationsRemoved = 0;

  const newSarif = {
    ...sarif,
    runs: sarif.runs.map((run) => {
      if (
        run.tool?.driver?.name !== "CodeQL" ||
        !Array.isArray(run.invocations)
      ) {
        return run;
      }
      return {
        ...run,
        invocations: run.invocations.map((invocation) => {
          if (!Array.isArray(invocation.toolExecutionNotifications)) {
            return invocation;
          }
          return {
            ...invocation,
            toolExecutionNotifications:
              invocation.toolExecutionNotifications.map((notification) => {
                if (!Array.isArray(notification.locations)) {
                  return notification;
                }
                const newLocations = removeDuplicateLocations(
                  notification.locations,
                );
                numDuplicateLocationsRemoved +=
                  notification.locations.length - newLocations.length;
                return {
                  ...notification,
                  locations: newLocations,
                };
              }),
          };
        }),
      };
    }),
  };

  if (numDuplicateLocationsRemoved > 0) {
    logger.info(
      `Removed ${numDuplicateLocationsRemoved} duplicate locations from SARIF notification ` +
        "objects.",
    );
  } else {
    logger.debug("No duplicate locations found in SARIF notification objects.");
  }
  return newSarif;
}
