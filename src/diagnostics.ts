import * as fs from "fs";
import path from "path";

import type { ActionState } from "./action-common";
import { getTemporaryDirectory } from "./actions-util";
import type { Config } from "./config-utils";
import { Language } from "./languages";
import { getActionsLogger, type Logger } from "./logging";
import {
  getCodeQLDatabasePath,
  getErrorMessage,
  isErrnoException,
} from "./util";

/**
 * Known tags for diagnostics. There is currently only "internal-error",
 * but others may be added in the future.
 */
export type DiagnosticTag = "internal-error";

/** Optional information about the origin of a diagnostic. */
export type DiagnosticSourceOptions = {
  /**
   * Name of the CodeQL extractor. This is used to identify which tool component the reporting
   * descriptor object should be nested under in SARIF.
   */
  extractorName?: string;
  /** An array of tags for the diagnostic. */
  tags?: DiagnosticTag[];
};

/** Represents information about the origin of a diagnostic. */
export type DiagnosticSource = {
  /**
   * An identifier under which it makes sense to group this diagnostic message.
   * This is used to build the SARIF reporting descriptor object.
   */
  id: string;
  /** Display name for the ID. This is used to build the SARIF reporting descriptor object. */
  name: string;
} & DiagnosticSourceOptions;

/**
 * Represents a diagnostic message for the tool status page, etc.
 *
 * Unlike {@link DiagnosticMessage}, properties which can automatically
 * be populated are optional in this type.
 */
export type DiagnosticMessageOptions = {
  /** ISO 8601 timestamp */
  timestamp?: string;
  /** Information about the origin of the diagnostic. */
  source?: DiagnosticSourceOptions;
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
};

/** Represents a diagnostic message for the tool status page, etc. */
export type DiagnosticMessage = DiagnosticMessageOptions & {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Information about the origin of the diagnostic. */
  source: DiagnosticSource;
};

/** Represents a diagnostic message that has not yet been saved to the database. */
interface TemporaryDiagnostic {
  /** The path to which the diagnostic has temporarily been written to. */
  path: string;
  /** The language the diagnostic is for, if any. */
  language?: Language;
}

/** A list of diagnostics which have not yet been saved to the database. */
let temporaryDiagnostics: TemporaryDiagnostic[] = [];

/**
 * Counter used to generate a unique suffix for each diagnostic filename, so that
 * two diagnostics produced within the same millisecond do not overwrite each
 * other on disk.
 */
let diagnosticCounter = 0;

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
  data: DiagnosticMessageOptions | undefined = undefined,
): DiagnosticMessage {
  return {
    ...data,
    timestamp: data?.timestamp ?? new Date().toISOString(),
    source: { ...data?.source, id, name },
  };
}

/**
 * Gets a path relative to {@link tmpDir} where diagnostics for {@link language}
 * can temporarily be stored at before the database is initialised. If {@link language}
 * is `undefined`, then the common base path for all languages relative to {@link tmpDir}
 * is returned.
 */
export function getTempDiagnosticPath(tmpDir: string, language?: Language) {
  const root = path.join(tmpDir, "codeql-action-temp-diagnostics");
  return getDiagnosticsPath(root, language);
}

/**
 * Gets a path relative to {@link basePath} where diagnostics for {@link language}
 * should be stored at. If {@link language} is `undefined`, then {@link basePath}
 * is returned instead.
 */
export function getDiagnosticsPath(basePath: string, language?: Language) {
  if (language !== undefined) {
    return path.resolve(basePath, language, "diagnostic", "codeql-action");
  }
  return path.resolve(basePath, "diagnostic", "codeql-action");
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
  logger: Logger = getActionsLogger(),
) {
  const databasePath = language
    ? getCodeQLDatabasePath(config, language)
    : config.dbLocation;

  // Check that the database exists before writing to it. If the database does not yet exist,
  // store the diagnostic in memory and write it later.
  if (fs.existsSync(databasePath)) {
    writeDiagnostic({ logger }, config, language, diagnostic);
  } else {
    logger.debug(
      `Writing a diagnostic for ${language}, but the database at ${databasePath} does not exist yet.`,
    );

    // Write the diagnostic to a temporary location.
    writeTemporaryDiagnosticFile(logger, config.tempDir, language, diagnostic);
  }
}

/** Adds a diagnostic that is not specific to any language. */
export function addNoLanguageDiagnostic(
  config: Config | undefined,
  diagnostic: DiagnosticMessage,
  logger: Logger = getActionsLogger(),
) {
  if (config !== undefined) {
    addDiagnostic(
      config,
      // Arbitrarily choose the first language. We could also choose all languages, but that
      // increases the risk of misinterpreting the data.
      config.languages[0],
      diagnostic,
    );
  } else {
    logger.debug(
      `Writing a diagnostic not associated with any language, but we have no configuration to tell us where the database is yet.`,
    );

    // Write the diagnostic to a temporary location.
    writeTemporaryDiagnosticFile(
      logger,
      getTemporaryDirectory(),
      undefined,
      diagnostic,
    );
  }
}

/**
 * Writes {@link diagnostic} for an optional {@link language} to a subdirectory of {@link tempDir}
 * and tracks it as a diagnostic that was written to a temporary location.
 */
function writeTemporaryDiagnosticFile(
  logger: Logger,
  tempDir: string,
  language: Language | undefined,
  diagnostic: DiagnosticMessage,
) {
  const tempDiagnosticsPath = getTempDiagnosticPath(tempDir, language);

  try {
    // Write the diagnostic to a temporary location.
    const diagnosticPath = writeDiagnosticFile(tempDiagnosticsPath, diagnostic);

    // Track the temporary file.
    temporaryDiagnostics.push({ path: diagnosticPath, language });
  } catch (err) {
    logger.warning(
      `Unable to write temporary diagnostic to '${tempDiagnosticsPath}': ${getErrorMessage(err)}\n\n${JSON.stringify(diagnostic)}`,
    );
  }
}

/**
 * Writes {@link diagnostic} to a file in {@link diagnosticsPath}.
 */
function writeDiagnosticFile(
  diagnosticsPath: string,
  diagnostic: DiagnosticMessage,
): string {
  // Create the directory if it doesn't exist yet.
  fs.mkdirSync(diagnosticsPath, { recursive: true });

  // Include a monotonically increasing suffix to avoid filename collisions
  // between diagnostics produced within the same millisecond.
  const uniqueSuffix = (diagnosticCounter++).toString();
  // We should only need to remove colons, but to be defensive, only allow a restricted set of
  // characters.
  const sanitizedTimestamp = diagnostic.timestamp.replace(
    /[^a-zA-Z0-9.-]/g,
    "",
  );
  const jsonPath = path.resolve(
    diagnosticsPath,
    `codeql-action-${sanitizedTimestamp}-${uniqueSuffix}.json`,
  );

  fs.writeFileSync(jsonPath, JSON.stringify(diagnostic));

  return jsonPath;
}

/** Gets the path where diagnostics for {@link language} should be stored in the database. */
export function getDatabaseDiagnosticsPath(
  config: Config,
  language: Language | undefined,
) {
  return getDiagnosticsPath(config.dbLocation, language);
}

/**
 * Writes the given diagnostic to the database.
 *
 * @param config The configuration that tells us where to store the diagnostic.
 * @param language The language which the diagnostic is for.
 * @param diagnostic The diagnostic message to add to the database.
 */
function writeDiagnostic(
  action: ActionState<["Logger"]>,
  config: Config,
  language: Language | undefined,
  diagnostic: DiagnosticMessage,
) {
  const diagnosticsPath = getDatabaseDiagnosticsPath(config, language);

  try {
    writeDiagnosticFile(diagnosticsPath, diagnostic);
  } catch (err) {
    action.logger.warning(
      `Unable to write diagnostic message to database: ${err}`,
    );
    action.logger.debug(JSON.stringify(diagnostic));
  }
}

/** Report if there are temporary diagnostics and write them to the log. */
export function logTemporaryDiagnostics(action: ActionState<["Logger"]>) {
  const num = temporaryDiagnostics.length;

  if (num > 0) {
    action.logger.warning(
      `${num} diagnostic(s) could not be written to the database and will not appear on the Tool Status Page.`,
    );

    for (const temporary of temporaryDiagnostics) {
      action.logger.debug(fs.readFileSync(temporary.path, "utf-8"));
    }
  }
}

/** Relocates all temporary diagnostics to the respective databases. */
export function flushDiagnostics(
  action: ActionState<["Logger"]>,
  config: Config,
) {
  const diagnosticsCount = temporaryDiagnostics.length;
  action.logger.debug(
    `Moving ${diagnosticsCount} diagnostic(s) to their respective databases.`,
  );

  const failedFlushDiagnostics: TemporaryDiagnostic[] = [];
  for (const temporary of temporaryDiagnostics) {
    // If `temporary.language` is `undefined`, then we didn't have a `config` at the time that
    // `addNoLanguageDiagnostic` was called. In that case, we arbitrarily choose the first
    // configured language here like we would have done in `addNoLanguageDiagnostic`.
    const directory = getDatabaseDiagnosticsPath(
      config,
      temporary.language ?? config.languages[0],
    );
    const filename = path.basename(temporary.path);
    const destination = path.join(directory, filename);

    try {
      fs.mkdirSync(directory, { recursive: true });
      try {
        fs.renameSync(temporary.path, destination);
      } catch (renameErr: unknown) {
        // Rethrow the error if it isn't an EXDEV one.
        if (!isErrnoException(renameErr) || renameErr.code !== "EXDEV") {
          throw renameErr;
        }

        // The error was an EXDEV one: try to copy the file and delete the temporary one.
        fs.copyFileSync(temporary.path, destination);
        fs.unlinkSync(temporary.path);
      }
    } catch (err) {
      action.logger.warning(
        `Failed to relocate '${temporary.path}' to '${destination}': ${getErrorMessage(err)}`,
      );

      failedFlushDiagnostics.push(temporary);
    }
  }

  // Reset the temporary diagnostics arrays.
  temporaryDiagnostics = failedFlushDiagnostics;
}

/**
 * Creates a telemetry-only diagnostic message. This is a convenience function
 * for creating diagnostics that should only be sent to telemetry and not
 * displayed on the status page or CLI summary table.
 *
 * @param id An identifier under which it makes sense to group this diagnostic message
 * @param name Display name
 * @param attributes Structured metadata
 */
export function makeTelemetryDiagnostic(
  id: string,
  name: string,
  attributes: { [key: string]: any },
  tags?: DiagnosticTag[],
): DiagnosticMessage {
  return makeDiagnostic(id, name, {
    attributes,
    visibility: {
      cliSummaryTable: false,
      statusPage: false,
      telemetry: true,
    },
    source: {
      tags,
    },
  });
}
