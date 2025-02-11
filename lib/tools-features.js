"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeArtifactUploadVersion = exports.ToolsFeature = void 0;
exports.isSupportedToolsFeature = isSupportedToolsFeature;
exports.isSafeArtifactUpload = isSafeArtifactUpload;
const semver = __importStar(require("semver"));
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
exports.SafeArtifactUploadVersion = "2.20.3";
/**
 * The first version of the CodeQL CLI where artifact upload is safe to use
 * for failed runs. This is not really a feature flag, but it is easiest to
 * model the behavior as a feature flag.
 *
 * This was not captured in a tools feature, so we need to use semver.
 *
 * @param codeQlVersion The version of the CodeQL CLI to check. If not provided, it is assumed to be safe.
 * @returns True if artifact upload is safe to use for failed runs or false otherwise.
 */
function isSafeArtifactUpload(codeQlVersion) {
    return !codeQlVersion
        ? true
        : semver.gte(codeQlVersion, exports.SafeArtifactUploadVersion);
}
//# sourceMappingURL=tools-features.js.map