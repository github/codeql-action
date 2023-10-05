"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDiagnostic = exports.makeDiagnostic = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const logging_1 = require("./logging");
const util_1 = require("./util");
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
 * Writes the given diagnostic to the database.
 *
 * @param config The configuration that tells us where to store the diagnostic.
 * @param diagnostic The diagnostic message to add to the database.
 */
function addDiagnostic(config, language, diagnostic) {
    const logger = (0, logging_1.getActionsLogger)();
    const diagnosticsPath = path_1.default.resolve((0, util_1.getCodeQLDatabasePath)(config, language), "diagnostic", "codeql-action");
    // Create the directory if it doesn't exist yet.
    (0, fs_1.mkdirSync)(diagnosticsPath, { recursive: true });
    const jsonPath = path_1.default.resolve(diagnosticsPath, `codeql-action-${diagnostic.timestamp}.json`);
    try {
        (0, fs_1.writeFileSync)(jsonPath, JSON.stringify(diagnostic));
    }
    catch (err) {
        logger.warning(`Unable to write diagnostic message to database: ${err}`);
    }
}
exports.addDiagnostic = addDiagnostic;
//# sourceMappingURL=diagnostics.js.map