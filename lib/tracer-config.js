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
exports.getCombinedTracerConfig = exports.getTracerConfigForCluster = exports.endTracingForCluster = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const languages_1 = require("./languages");
async function endTracingForCluster(config) {
    // If there are no traced languages, we don't need to do anything.
    if (!config.languages.some((l) => (0, languages_1.isTracedLanguage)(l)))
        return;
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
async function getCombinedTracerConfig(config) {
    // Abort if there are no traced languages as there's nothing to do
    const tracedLanguages = config.languages.filter((l) => (0, languages_1.isTracedLanguage)(l));
    if (tracedLanguages.length === 0) {
        return undefined;
    }
    const mainTracerConfig = await getTracerConfigForCluster(config);
    // On macos it's necessary to prefix the build command with the runner executable
    // on order to trace when System Integrity Protection is enabled.
    // The executable also exists and works for other platforms so we output this env
    // var with a path to the runner regardless so it's always available.
    const runnerExeName = process.platform === "win32" ? "runner.exe" : "runner";
    mainTracerConfig.env["CODEQL_RUNNER"] = path.join(mainTracerConfig.env["CODEQL_DIST"], "tools", mainTracerConfig.env["CODEQL_PLATFORM"], runnerExeName);
    return mainTracerConfig;
}
exports.getCombinedTracerConfig = getCombinedTracerConfig;
//# sourceMappingURL=tracer-config.js.map