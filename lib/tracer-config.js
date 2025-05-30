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
exports.shouldEnableIndirectTracing = shouldEnableIndirectTracing;
exports.endTracingForCluster = endTracingForCluster;
exports.getTracerConfigForCluster = getTracerConfigForCluster;
exports.getCombinedTracerConfig = getCombinedTracerConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const languages_1 = require("./languages");
const util_1 = require("./util");
async function shouldEnableIndirectTracing(_codeql, config) {
    // We don't need to trace build mode none, or languages which unconditionally don't need tracing.
    if (config.buildMode === util_1.BuildMode.None) {
        return false;
    }
    // If the CLI supports `trace-command` with a `--build-mode`, we'll use direct tracing instead of
    // indirect tracing.
    if (config.buildMode === util_1.BuildMode.Autobuild) {
        return false;
    }
    // Otherwise, use direct tracing if any of the languages need to be traced.
    return config.languages.some((l) => (0, languages_1.isTracedLanguage)(l));
}
/**
 * Delete variables as specified by the end-tracing script
 *
 * WARNING: This does not _really_ end tracing, as the tracer will restore its
 * critical environment variables and it'll still be active for all processes
 * launched from this build step.
 *
 * However, it will stop tracing for all steps past the current build step.
 */
async function endTracingForCluster(codeql, config, logger) {
    if (!(await shouldEnableIndirectTracing(codeql, config)))
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
async function getTracerConfigForCluster(config) {
    const tracingEnvVariables = JSON.parse(fs.readFileSync(path.resolve(config.dbLocation, "temp/tracingEnvironment/start-tracing.json"), "utf8"));
    return {
        env: tracingEnvVariables,
    };
}
async function getCombinedTracerConfig(codeql, config) {
    if (!(await shouldEnableIndirectTracing(codeql, config))) {
        return undefined;
    }
    return await getTracerConfigForCluster(config);
}
//# sourceMappingURL=tracer-config.js.map