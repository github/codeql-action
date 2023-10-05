import { writeFileSync } from "fs";
import path from "path";

import { Config } from "./config-utils";
import { getActionsLogger } from "./logging";

/** Represents a diagnostic message for the tool status page, etc. */
export interface DiagnosticMessage {
  /** ISO 8601 timestamp */
  timestamp: string;
  source: {
    /**
     * An identifier under which it makes sense to group this diagnostic message.
     * This is used to build the SARIF reporting descriptor object.
     */
    id: string;
    /** Display name for the ID. This is used to build the SARIF reporting descriptor object. */
    name: string;
    /**
     * Name of the CodeQL extractor. This is used to identify which tool component the reporting
     * descriptor object should be nested under in SARIF.
     */
    extractorName?: string;
  };
  /** GitHub flavored Markdown formatted message. Should include inline links to any help pages. */
  markdownMessage?: string;
  /** Plain text message. Used by components where the string processing needed to support Markdown is cumbersome. */
  plaintextMessage?: string;
  /** List of help links intended to supplement the `plaintextMessage`. */
  helpLinks?: string[];
  /** SARIF severity */
  severity?: "error" | "warning" | "note";
  visibility?: {
    /** True if the message should be displayed on the status page (defaults to false) */
    statusPage?: boolean;
    /**
     * True if the message should be counted in the diagnostics summary table printed by `codeql database analyze`
     * (defaults to false)
     */
    cliSummaryTable?: boolean;
    /** True if the message should be sent to telemetry (defaults to false) */
    telemetry?: boolean;
  };
  location?: {
    /** Path to the affected file if appropriate, relative to the source root */
    file?: string;
    startLine?: number;
    startColumn?: number;
    endLine?: number;
    endColumn?: number;
  };
  /** Structured metadata about the diagnostic message */
  attributes?: { [key: string]: any };
}

/**
 * Constructs a new diagnostic message with the specified id and name, as well as optional additional data.
 *
 * @param id An identifier under which it makes sense to group this diagnostic message.
 * @param name Display name for the ID.
 * @param data Optional additional data to initialize the diagnostic with.
 * @returns Returns the new diagnostic message.
 */
export function makeDiagnostic(
  id: string,
  name: string,
  data: Partial<DiagnosticMessage> | undefined = undefined,
): DiagnosticMessage {
  return {
    ...data,
    timestamp: data?.timestamp ?? new Date().toISOString(),
    source: { ...data?.source, id, name },
  };
}

/**
 * Writes the given diagnostic to the database.
 *
 * @param config The configuration that tells us where to store the diagnostic.
 * @param diagnostic The diagnostic message to add to the database.
 */
export function addDiagnostic(config: Config, diagnostic: DiagnosticMessage) {
  const logger = getActionsLogger();
  const diagnosticsPath = path.resolve(config.dbLocation, "diagnostic");
  const jsonPath = path.resolve(
    diagnosticsPath,
    `codeql-action-${diagnostic.timestamp}.json`,
  );

  try {
    writeFileSync(jsonPath, JSON.stringify(diagnostic));
  } catch (err) {
    logger.warning(`Unable to write diagnostic message to database: ${err}`);
  }
}
