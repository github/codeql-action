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
const path_1 = __importDefault(require("path"));
const ava_1 = __importDefault(require("ava"));
const init_1 = require("./init");
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("printPathFiltersWarning does not trigger when 'paths' and 'paths-ignore' are undefined", async (t) => {
    const messages = [];
    (0, init_1.printPathFiltersWarning)({
        languages: [languages_1.Language.cpp],
        originalUserInput: {},
    }, (0, testing_utils_1.getRecordingLogger)(messages));
    t.is(messages.length, 0);
});
(0, ava_1.default)("printPathFiltersWarning does not trigger when 'paths' and 'paths-ignore' are empty", async (t) => {
    const messages = [];
    (0, init_1.printPathFiltersWarning)({
        languages: [languages_1.Language.cpp],
        originalUserInput: { paths: [], "paths-ignore": [] },
    }, (0, testing_utils_1.getRecordingLogger)(messages));
    t.is(messages.length, 0);
});
(0, ava_1.default)("cleanupDatabaseClusterDirectory cleans up where possible", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const dbLocation = path_1.default.resolve(tmpDir, "dbs");
        fs.mkdirSync(dbLocation, { recursive: true });
        const fileToCleanUp = path_1.default.resolve(dbLocation, "something-to-cleanup.txt");
        fs.writeFileSync(fileToCleanUp, "");
        const messages = [];
        (0, init_1.cleanupDatabaseClusterDirectory)((0, testing_utils_1.createTestConfig)({ dbLocation }), (0, testing_utils_1.getRecordingLogger)(messages));
        t.is(messages.length, 2);
        t.is(messages[0].type, "warning");
        t.is(messages[0].message, `The database cluster directory ${dbLocation} must be empty. Attempting to clean it up.`);
        t.is(messages[1].type, "info");
        t.is(messages[1].message, `Cleaned up database cluster directory ${dbLocation}.`);
        t.false(fs.existsSync(fileToCleanUp));
    });
});
for (const { runnerEnv, ErrorConstructor, message } of [
    {
        runnerEnv: "self-hosted",
        ErrorConstructor: util_1.ConfigurationError,
        message: (dbLocation) => "The CodeQL Action requires an empty database cluster directory. By default, this is located " +
            `at ${dbLocation}. You can customize it using the 'db-location' input to the init Action. An ` +
            "attempt was made to clean up the directory, but this failed. This can happen if another " +
            "process is using the directory or the directory is owned by a different user. Please clean " +
            "up the directory manually and rerun the job.",
    },
    {
        runnerEnv: "github-hosted",
        ErrorConstructor: Error,
        message: (dbLocation) => "The CodeQL Action requires an empty database cluster directory. By default, this is located " +
            `at ${dbLocation}. You can customize it using the 'db-location' input to the init Action. An ` +
            "attempt was made to clean up the directory, but this failed. This shouldn't typically " +
            "happen on hosted runners. If you are using an advanced setup, please check your workflow, " +
            "otherwise we recommend rerunning the job.",
    },
]) {
    (0, ava_1.default)(`cleanupDatabaseClusterDirectory throws a ${ErrorConstructor.name} when cleanup fails on ${runnerEnv} runner`, async (t) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            process.env["RUNNER_ENVIRONMENT"] = runnerEnv;
            const dbLocation = path_1.default.resolve(tmpDir, "dbs");
            fs.mkdirSync(dbLocation, { recursive: true });
            const fileToCleanUp = path_1.default.resolve(dbLocation, "something-to-cleanup.txt");
            fs.writeFileSync(fileToCleanUp, "");
            const rmSyncError = `Failed to clean up file ${fileToCleanUp}`;
            const messages = [];
            t.throws(() => (0, init_1.cleanupDatabaseClusterDirectory)((0, testing_utils_1.createTestConfig)({ dbLocation }), (0, testing_utils_1.getRecordingLogger)(messages), () => {
                throw new Error(rmSyncError);
            }), {
                instanceOf: ErrorConstructor,
                message: `${message(dbLocation)} Details: ${rmSyncError}`,
            });
            t.is(messages.length, 1);
            t.is(messages[0].type, "warning");
            t.is(messages[0].message, `The database cluster directory ${dbLocation} must be empty. Attempting to clean it up.`);
        });
    });
}
//# sourceMappingURL=init.test.js.map