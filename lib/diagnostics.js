"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeDiagnostic = makeDiagnostic;
exports.addDiagnostic = addDiagnostic;
exports.logUnwrittenDiagnostics = logUnwrittenDiagnostics;
exports.flushDiagnostics = flushDiagnostics;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const logging_1 = require("./logging");
const util_1 = require("./util");
/** A list of diagnostics which have not yet been written to disk. */
let unwrittenDiagnostics = [];
/**
 * Constructs a new diagnostic message with the specified id and name, as well as optional additional data.
 *
 * @param id An identifier under which it makes sense to group this diagnostic message.
 * @param name Display name for the ID.
 * @param data Optional additional data to initialize the diagnostic with.
 * @returns Returns the new diagnostic message.
 */
function makeDiagnostic(id, name, data = undefined) {
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
function addDiagnostic(config, language, diagnostic) {
    const logger = (0, logging_1.getActionsLogger)();
    const databasePath = language
        ? (0, util_1.getCodeQLDatabasePath)(config, language)
        : config.dbLocation;
    // Check that the database exists before writing to it. If the database does not yet exist,
    // store the diagnostic in memory and write it later.
    if ((0, fs_1.existsSync)(databasePath)) {
        writeDiagnostic(config, language, diagnostic);
    }
    else {
        logger.debug(`Writing a diagnostic for ${language}, but the database at ${databasePath} does not exist yet.`);
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
function writeDiagnostic(config, language, diagnostic) {
    const logger = (0, logging_1.getActionsLogger)();
    const databasePath = language
        ? (0, util_1.getCodeQLDatabasePath)(config, language)
        : config.dbLocation;
    const diagnosticsPath = path_1.default.resolve(databasePath, "diagnostic", "codeql-action");
    try {
        // Create the directory if it doesn't exist yet.
        (0, fs_1.mkdirSync)(diagnosticsPath, { recursive: true });
        const jsonPath = path_1.default.resolve(diagnosticsPath, 
        // Remove colons from the timestamp as these are not allowed in Windows filenames.
        `codeql-action-${diagnostic.timestamp.replaceAll(":", "")}.json`);
        (0, fs_1.writeFileSync)(jsonPath, JSON.stringify(diagnostic));
    }
    catch (err) {
        logger.warning(`Unable to write diagnostic message to database: ${err}`);
        logger.debug(JSON.stringify(diagnostic));
    }
}
/** Report if there are unwritten diagnostics and write them to the log. */
function logUnwrittenDiagnostics() {
    const logger = (0, logging_1.getActionsLogger)();
    const num = unwrittenDiagnostics.length;
    if (num > 0) {
        logger.warning(`${num} diagnostic(s) could not be written to the database and will not appear on the Tool Status Page.`);
        for (const unwritten of unwrittenDiagnostics) {
            logger.debug(JSON.stringify(unwritten.diagnostic));
        }
    }
}
/** Writes all unwritten diagnostics to disk. */
function flushDiagnostics(config) {
    const logger = (0, logging_1.getActionsLogger)();
    logger.debug(`Writing ${unwrittenDiagnostics.length} diagnostic(s) to database.`);
    for (const unwritten of unwrittenDiagnostics) {
        writeDiagnostic(config, unwritten.language, unwritten.diagnostic);
    }
    // Reset the unwritten diagnostics array.
    unwrittenDiagnostics = [];
}
//# sourceMappingURL=diagnostics.js.map