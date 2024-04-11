"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flushDiagnostics = exports.addDiagnostic = exports.makeDiagnostic = void 0;
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
exports.makeDiagnostic = makeDiagnostic;
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
    const databasePath = (0, util_1.getCodeQLDatabasePath)(config, language);
    // Check that the database exists before writing to it. If the database does not yet exist,
    // store the diagnostic in memory and write it later.
    if ((0, fs_1.existsSync)(databasePath)) {
        writeDiagnostic(config, language, diagnostic);
    }
    else {
        logger.info(`Writing a diagnostic for ${language}, but the database at ${databasePath} does not exist yet.`);
        unwrittenDiagnostics.push({ diagnostic, language });
    }
}
exports.addDiagnostic = addDiagnostic;
/**
 * Writes the given diagnostic to the database.
 *
 * @param config The configuration that tells us where to store the diagnostic.
 * @param language The language which the diagnostic is for.
 * @param diagnostic The diagnostic message to add to the database.
 */
function writeDiagnostic(config, language, diagnostic) {
    const logger = (0, logging_1.getActionsLogger)();
    const diagnosticsPath = path_1.default.resolve((0, util_1.getCodeQLDatabasePath)(config, language), "diagnostic", "codeql-action");
    try {
        // Create the directory if it doesn't exist yet.
        (0, fs_1.mkdirSync)(diagnosticsPath, { recursive: true });
        const jsonPath = path_1.default.resolve(diagnosticsPath, `codeql-action-${diagnostic.timestamp}.json`);
        (0, fs_1.writeFileSync)(jsonPath, JSON.stringify(diagnostic));
    }
    catch (err) {
        logger.warning(`Unable to write diagnostic message to database: ${err}`);
    }
}
/** Writes all unwritten diagnostics to disk. */
function flushDiagnostics(config) {
    const logger = (0, logging_1.getActionsLogger)();
    logger.info(`Writing ${unwrittenDiagnostics.length} diagnostic(s) to database.`);
    for (const unwritten of unwrittenDiagnostics) {
        writeDiagnostic(config, unwritten.language, unwritten.diagnostic);
    }
    // Reset the unwritten diagnostics array.
    unwrittenDiagnostics = [];
}
exports.flushDiagnostics = flushDiagnostics;
//# sourceMappingURL=diagnostics.js.map