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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCombinedTracerConfig = exports.getTracerConfigForCluster = exports.endTracingForCluster = exports.shouldEnableIndirectTracing = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const tools_features_1 = require("./tools-features");
const util_1 = require("./util");
async function shouldEnableIndirectTracing(codeql, config, features) {
    return ((!config.buildMode ||
        config.buildMode === util_1.BuildMode.Manual ||
        !(await features.getValue(feature_flags_1.Feature.AutobuildDirectTracing, codeql))) &&
        config.languages.some((l) => (0, languages_1.isTracedLanguage)(l)));
}
exports.shouldEnableIndirectTracing = shouldEnableIndirectTracing;
/**
 * Delete variables as specified by the end-tracing script
 *
 * WARNING: This does not _really_ end tracing, as the tracer will restore its
 * critical environment variables and it'll still be active for all processes
 * launched from this build step.
 *
 * However, it will stop tracing for all steps past the current build step.
 */
async function endTracingForCluster(codeql, config, logger, features) {
    if (!(await shouldEnableIndirectTracing(codeql, config, features)))
        return;
    logger.info("Unsetting build tracing environment variables. Subsequent steps of this job will not be traced.");
    const envVariablesFile = path.resolve(config.dbLocation, "temp/tracingEnvironment/end-tracing.json");
    if (!fs.existsSync(envVariablesFile)) {
        throw new Error(`Environment file for ending tracing not found: ${envVariablesFile}`);
    }
    try {
        const endTracingEnvVariables = JSON.parse(fs.readFileSync(envVariablesFile, "utf8"));
        for (const [key, value] of Object.entries(endTracingEnvVariables)) {
            if (value !== null) {
                process.env[key] = value;
            }
            else {
                delete process.env[key];
            }
        }
    }
    catch (e) {
        throw new Error(`Failed to parse file containing end tracing environment variables: ${e}`);
    }
}
exports.endTracingForCluster = endTracingForCluster;
async function getTracerConfigForCluster(config) {
    const tracingEnvVariables = JSON.parse(fs.readFileSync(path.resolve(config.dbLocation, "temp/tracingEnvironment/start-tracing.json"), "utf8"));
    return {
        env: tracingEnvVariables,
    };
}
exports.getTracerConfigForCluster = getTracerConfigForCluster;
async function getCombinedTracerConfig(codeql, config, features) {
    if (!(await shouldEnableIndirectTracing(codeql, config, features)))
        return undefined;
    const mainTracerConfig = await getTracerConfigForCluster(config);
    // If the CLI doesn't yet support setting the CODEQL_RUNNER environment variable to
    // the runner executable path, we set it here in the Action.
    if (!(await codeql.supportsFeature(tools_features_1.ToolsFeature.SetsCodeqlRunnerEnvVar))) {
        // On MacOS when System Integrity Protection is enabled, it's necessary to prefix
        // the build command with the runner executable for indirect tracing, so we expose
        // it here via the CODEQL_RUNNER environment variable.
        // The executable also exists and works for other platforms so we unconditionally
        // set the environment variable.
        const runnerExeName = process.platform === "win32" ? "runner.exe" : "runner";
        mainTracerConfig.env["CODEQL_RUNNER"] = path.join(mainTracerConfig.env["CODEQL_DIST"], "tools", mainTracerConfig.env["CODEQL_PLATFORM"], runnerExeName);
    }
    return mainTracerConfig;
}
exports.getCombinedTracerConfig = getCombinedTracerConfig;
//# sourceMappingURL=tracer-config.js.map