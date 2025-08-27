"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportedAnalysisKinds = exports.AnalysisKind = void 0;
exports.parseAnalysisKinds = parseAnalysisKinds;
const util_1 = require("./util");
var AnalysisKind;
(function (AnalysisKind) {
    AnalysisKind["CodeScanning"] = "code-scanning";
    AnalysisKind["CodeQuality"] = "code-quality";
})(AnalysisKind || (exports.AnalysisKind = AnalysisKind = {}));
// Exported for testing. A set of all known analysis kinds.
exports.supportedAnalysisKinds = new Set(Object.values(AnalysisKind));
/**
 * Parses a comma-separated string into a list of unique analysis kinds.
 * Throws a configuration error if the input contains unknown analysis kinds
 * or doesn't contain at least one element.
 *
 * @param input The comma-separated string to parse.
 * @returns The array of unique analysis kinds that were parsed from the input string.
 */
async function parseAnalysisKinds(input) {
    const components = input.split(",");
    if (components.length < 1) {
        throw new util_1.ConfigurationError("At least one analysis kind must be configured.");
    }
    for (const component of components) {
        if (!exports.supportedAnalysisKinds.has(component)) {
            throw new util_1.ConfigurationError(`Unknown analysis kind: ${component}`);
        }
    }
    // Return all unique elements.
    return Array.from(new Set(components.map((component) => component)));
}
//# sourceMappingURL=analyses.js.map