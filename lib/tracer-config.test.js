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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
const tracer_config_1 = require("./tracer-config");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
function getTestConfig(tempDir) {
    return (0, testing_utils_1.createTestConfig)({
        languages: [languages_1.Language.java],
        tempDir,
        dbLocation: path.resolve(tempDir, "codeql_databases"),
    });
}
(0, ava_1.default)("getCombinedTracerConfig - return undefined when no languages are traced languages", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        // No traced languages
        config.languages = [languages_1.Language.javascript, languages_1.Language.python];
        t.deepEqual(await (0, tracer_config_1.getCombinedTracerConfig)((0, testing_utils_1.mockCodeQLVersion)("1.0.0"), config), undefined);
    });
});
(0, ava_1.default)("getCombinedTracerConfig - with start-tracing.json environment file", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const bundlePath = path.join(tmpDir, "bundle");
        const codeqlPlatform = process.platform === "win32"
            ? "win64"
            : process.platform === "darwin"
                ? "osx64"
                : "linux64";
        const startTracingEnv = {
            foo: "bar",
            CODEQL_DIST: bundlePath,
            CODEQL_PLATFORM: codeqlPlatform,
        };
        const tracingEnvironmentDir = path.join(config.dbLocation, "temp", "tracingEnvironment");
        fs.mkdirSync(tracingEnvironmentDir, { recursive: true });
        const startTracingJson = path.join(tracingEnvironmentDir, "start-tracing.json");
        fs.writeFileSync(startTracingJson, JSON.stringify(startTracingEnv));
        const result = await (0, tracer_config_1.getCombinedTracerConfig)((0, testing_utils_1.mockCodeQLVersion)("1.0.0"), config);
        t.notDeepEqual(result, undefined);
        const expectedEnv = startTracingEnv;
        if (process.platform === "win32") {
            expectedEnv["CODEQL_RUNNER"] = path.join(bundlePath, "tools/win64/runner.exe");
        }
        else if (process.platform === "darwin") {
            expectedEnv["CODEQL_RUNNER"] = path.join(bundlePath, "tools/osx64/runner");
        }
        else {
            expectedEnv["CODEQL_RUNNER"] = path.join(bundlePath, "tools/linux64/runner");
        }
        t.deepEqual(result, {
            env: expectedEnv,
        });
    });
});
(0, ava_1.default)("getCombinedTracerConfig - with SetsCodeqlRunnerEnvVar feature enabled in CLI", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfig(tmpDir);
        const bundlePath = path.join(tmpDir, "bundle");
        const codeqlPlatform = process.platform === "win32"
            ? "win64"
            : process.platform === "darwin"
                ? "osx64"
                : "linux64";
        const startTracingEnv = {
            foo: "bar",
            CODEQL_DIST: bundlePath,
            CODEQL_PLATFORM: codeqlPlatform,
        };
        const tracingEnvironmentDir = path.join(config.dbLocation, "temp", "tracingEnvironment");
        fs.mkdirSync(tracingEnvironmentDir, { recursive: true });
        const startTracingJson = path.join(tracingEnvironmentDir, "start-tracing.json");
        fs.writeFileSync(startTracingJson, JSON.stringify(startTracingEnv));
        const result = await (0, tracer_config_1.getCombinedTracerConfig)((0, testing_utils_1.mockCodeQLVersion)("1.0.0", { setsCodeqlRunnerEnvVar: true }), config);
        t.notDeepEqual(result, undefined);
        t.false(Object.prototype.hasOwnProperty.call(result?.env, "CODEQL_RUNNER"));
    });
});
//# sourceMappingURL=tracer-config.test.js.map