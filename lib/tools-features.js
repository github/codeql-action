"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolsFeature = void 0;
exports.isSupportedToolsFeature = isSupportedToolsFeature;
var ToolsFeature;
(function (ToolsFeature) {
    ToolsFeature["AnalysisSummaryV2IsDefault"] = "analysisSummaryV2Default";
    ToolsFeature["BuildModeOption"] = "buildModeOption";
    ToolsFeature["DatabaseInterpretResultsSupportsSarifRunProperty"] = "databaseInterpretResultsSupportsSarifRunProperty";
    ToolsFeature["IndirectTracingSupportsStaticBinaries"] = "indirectTracingSupportsStaticBinaries";
    ToolsFeature["InformsAboutUnsupportedPathFilters"] = "informsAboutUnsupportedPathFilters";
    ToolsFeature["SetsCodeqlRunnerEnvVar"] = "setsCodeqlRunnerEnvVar";
    ToolsFeature["TraceCommandUseBuildMode"] = "traceCommandUseBuildMode";
    ToolsFeature["SarifMergeRunsFromEqualCategory"] = "sarifMergeRunsFromEqualCategory";
    ToolsFeature["ForceOverwrite"] = "forceOverwrite";
    ToolsFeature["PythonDefaultIsToNotExtractStdlib"] = "pythonDefaultIsToNotExtractStdlib";
})(ToolsFeature || (exports.ToolsFeature = ToolsFeature = {}));
/**
 * Determines if the given feature is supported by the CLI.
 *
 * @param versionInfo Version information, including features, returned by the CLI.
 * @param feature The feature to check for.
 * @returns True if the feature is supported or false otherwise.
 */
function isSupportedToolsFeature(versionInfo, feature) {
    return !!versionInfo.features && versionInfo.features[feature];
}
//# sourceMappingURL=tools-features.js.map