import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

import type { Config } from "./config-utils";
import { Language } from "./languages";
import { getActionsLogger } from "./logging";
import { getCodeQLDatabasePath } from "./util";

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

/** Represents a diagnostic message that has not yet been written to the database. */
interface UnwrittenDiagnostic {
  /** The diagnostic message that has not yet been written. */
  diagnostic: DiagnosticMessage;
  /** The language the diagnostic is for. */
  language: Language;
}

/** A list of diagnostics which have not yet been written to disk. */
let unwrittenDiagnostics: UnwrittenDiagnostic[] = [];

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
 * Adds the given diagnostic to the database. If the database does not yet exist,
 * the diagnostic will be written to it once it has been created.
 *
 * @param config The configuration that tells us where to store the diagnostic.
 * @param language The language which the diagnostic is for.
 * @param diagnostic The diagnostic message to add to the database.
 */
export function addDiagnostic(
  config: Config,
  language: Language,
  diagnostic: DiagnosticMessage,
) {
  const logger = getActionsLogger();
  const databasePath = language
    ? getCodeQLDatabasePath(config, language)
    : config.dbLocation;

  // Check that the database exists before writing to it. If the database does not yet exist,
  // store the diagnostic in memory and write it later.
  if (existsSync(databasePath)) {
    writeDiagnostic(config, language, diagnostic);
  } else {
    logger.debug(
      `Writing a diagnostic for ${language}, but the database at ${databasePath} does not exist yet.`,
    );

    unwrittenDiagnostics.push({ diagnostic, language });
  }
}

/**
 * Writes the given diagnostic to the database.
 *
 * @param config The configuration that tells us where to store the diagnostic.
 * @param language The language which the diagnostic is for.
 * @param diagnostic The diagnostic message to add to the database.
 */
function writeDiagnostic(
  config: Config,
  language: Language | undefined,
  diagnostic: DiagnosticMessage,
) {
  const logger = getActionsLogger();
  const databasePath = language
    ? getCodeQLDatabasePath(config, language)
    : config.dbLocation;
  const diagnosticsPath = path.resolve(
    databasePath,
    "diagnostic",
    "codeql-action",
  );

  try {
    // Create the directory if it doesn't exist yet.
    mkdirSync(diagnosticsPath, { recursive: true });

    const jsonPath = path.resolve(
      diagnosticsPath,
      // Remove colons from the timestamp as these are not allowed in Windows filenames.
      `codeql-action-${diagnostic.timestamp.replaceAll(":", "")}.json`,
    );

    writeFileSync(jsonPath, JSON.stringify(diagnostic));
  } catch (err) {
    logger.warning(`Unable to write diagnostic message to database: ${err}`);
    logger.debug(JSON.stringify(diagnostic));
  }
}

/** Report if there are unwritten diagnostics and write them to the log. */
export function logUnwrittenDiagnostics() {
  const logger = getActionsLogger();
  const num = unwrittenDiagnostics.length;
  if (num > 0) {
    logger.warning(
      `${num} diagnostic(s) could not be written to the database and will not appear on the Tool Status Page.`,
    );

    for (const unwritten of unwrittenDiagnostics) {
      logger.debug(JSON.stringify(unwritten.diagnostic));
    }
  }
}

/** Writes all unwritten diagnostics to disk. */
export function flushDiagnostics(config: Config) {
  const logger = getActionsLogger();
  logger.debug(
    `Writing ${unwrittenDiagnostics.length} diagnostic(s) to database.`,
  );

  for (const unwritten of unwrittenDiagnostics) {
    writeDiagnostic(config, unwritten.language, unwritten.diagnostic);
  }

  // Reset the unwritten diagnostics array.
  unwrittenDiagnostics = [];
}
