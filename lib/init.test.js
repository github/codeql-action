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
const codeql_1 = require("./codeql");
const init_1 = require("./init");
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
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
            t.throws(() => (0, init_1.cleanupDatabaseClusterDirectory)((0, testing_utils_1.createTestConfig)({ dbLocation }), (0, testing_utils_1.getRecordingLogger)(messages), {}, () => {
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
(0, ava_1.default)("cleanupDatabaseClusterDirectory can disable warning with options", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
        const dbLocation = path_1.default.resolve(tmpDir, "dbs");
        fs.mkdirSync(dbLocation, { recursive: true });
        const fileToCleanUp = path_1.default.resolve(dbLocation, "something-to-cleanup.txt");
        fs.writeFileSync(fileToCleanUp, "");
        const messages = [];
        (0, init_1.cleanupDatabaseClusterDirectory)((0, testing_utils_1.createTestConfig)({ dbLocation }), (0, testing_utils_1.getRecordingLogger)(messages), { disableExistingDirectoryWarning: true });
        // Should only have the info message, not the warning
        t.is(messages.length, 1);
        t.is(messages[0].type, "info");
        t.is(messages[0].message, `Cleaned up database cluster directory ${dbLocation}.`);
        t.false(fs.existsSync(fileToCleanUp));
    });
});
const testCheckPacksForOverlayCompatibility = ava_1.default.macro({
    exec: async (t, _title, { cliOverlayVersion, languages, packs, expectedResult, }) => {
        await (0, util_1.withTmpDir)(async (tmpDir) => {
            const packDirsByLanguage = new Map();
            for (const [packName, packInfo] of Object.entries(packs)) {
                const packPath = path_1.default.join(tmpDir, packName);
                fs.mkdirSync(packPath, { recursive: true });
                if (packInfo.packinfoContents) {
                    fs.writeFileSync(path_1.default.join(packPath, ".packinfo"), packInfo.packinfoContents);
                }
                const qlpackFileName = packInfo.qlpackFileName || "qlpack.yml";
                fs.writeFileSync(path_1.default.join(packPath, qlpackFileName), packInfo.sourceOnlyPack
                    ? `name: ${packName}\nversion: 1.0.0\n`
                    : `name: ${packName}\nversion: 1.0.0\nbuildMetadata:\n sha: 123abc\n`);
                if (!packDirsByLanguage.has(packInfo.language)) {
                    packDirsByLanguage.set(packInfo.language, []);
                }
                packDirsByLanguage.get(packInfo.language).push(packPath);
            }
            const codeql = (0, codeql_1.createStubCodeQL)({
                getVersion: async () => ({
                    version: "2.22.2",
                    overlayVersion: cliOverlayVersion,
                }),
                resolveQueriesStartingPacks: async (suitePaths) => {
                    for (const language of packDirsByLanguage.keys()) {
                        const suiteForLanguage = path_1.default.join(language, "temp", "config-queries.qls");
                        if (suitePaths[0].endsWith(suiteForLanguage)) {
                            return packDirsByLanguage.get(language) || [];
                        }
                    }
                    return [];
                },
            });
            const messages = [];
            const result = await (0, init_1.checkPacksForOverlayCompatibility)(codeql, (0, testing_utils_1.createTestConfig)({ dbLocation: tmpDir, languages }), (0, testing_utils_1.getRecordingLogger)(messages));
            t.is(result, expectedResult);
            t.deepEqual(messages.length, expectedResult ? 0 : 1, "Expected log messages");
        });
    },
    title: (_, title) => `checkPacksForOverlayCompatibility: ${title}`,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns false when CLI does not support overlay", {
    cliOverlayVersion: undefined,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
    },
    expectedResult: false,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns true when there are no query packs", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {},
    expectedResult: true,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns true when query pack has not been compiled", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: undefined,
            sourceOnlyPack: true,
        },
    },
    expectedResult: true,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns true when query pack has expected overlay version", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
    },
    expectedResult: true,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns true when query packs for all languages to analyze are compatible", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.cpp, languages_1.KnownLanguage.java],
    packs: {
        "codeql/cpp-queries": {
            language: languages_1.KnownLanguage.cpp,
            packinfoContents: '{"overlayVersion":2}',
        },
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
    },
    expectedResult: true,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns true when query pack for a language not analyzed is incompatible", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/cpp-queries": {
            language: languages_1.KnownLanguage.cpp,
            packinfoContents: undefined,
        },
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
    },
    expectedResult: true,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns false when query pack for a language to analyze is incompatible", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.cpp, languages_1.KnownLanguage.java],
    packs: {
        "codeql/cpp-queries": {
            language: languages_1.KnownLanguage.cpp,
            packinfoContents: '{"overlayVersion":1}',
        },
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
    },
    expectedResult: false,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns false when query pack is missing .packinfo", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
        "custom/queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: undefined,
        },
    },
    expectedResult: false,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns false when query pack has different overlay version", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
        "custom/queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":1}',
        },
    },
    expectedResult: false,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns false when query pack is missing overlayVersion in .packinfo", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
        "custom/queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: "{}",
        },
    },
    expectedResult: false,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns false when .packinfo is not valid JSON", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
        },
        "custom/queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: "this_is_not_valid_json",
        },
    },
    expectedResult: false,
});
(0, ava_1.default)(testCheckPacksForOverlayCompatibility, "returns true when query pack uses codeql-pack.yml filename", {
    cliOverlayVersion: 2,
    languages: [languages_1.KnownLanguage.java],
    packs: {
        "codeql/java-queries": {
            language: languages_1.KnownLanguage.java,
            packinfoContents: '{"overlayVersion":2}',
            qlpackFileName: "codeql-pack.yml",
        },
    },
    expectedResult: true,
});
//# sourceMappingURL=init.test.js.map