"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const analysisPaths = __importStar(require("./analysis-paths"));
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("emptyPaths", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const config = {
            languages: [],
            queries: {},
            pathsIgnore: [],
            paths: [],
            originalUserInput: {},
            tempDir: tmpDir,
            toolCacheDir: tmpDir,
            codeQLCmd: "",
            gitHubVersion: { type: util.GitHubVariant.DOTCOM },
            dbLocation: path.resolve(tmpDir, "codeql_databases"),
            packs: {},
            debugMode: false,
            debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
            debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
            augmentationProperties: {
                injectedMlQueries: false,
                packsInputCombines: false,
                queriesInputCombines: false,
            },
        };
        analysisPaths.includeAndExcludeAnalysisPaths(config);
        t.is(process.env["LGTM_INDEX_INCLUDE"], undefined);
        t.is(process.env["LGTM_INDEX_EXCLUDE"], undefined);
        t.is(process.env["LGTM_INDEX_FILTERS"], undefined);
    });
});
(0, ava_1.default)("nonEmptyPaths", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        const config = {
            languages: [],
            queries: {},
            paths: ["path1", "path2", "**/path3"],
            pathsIgnore: ["path4", "path5", "path6/**"],
            originalUserInput: {},
            tempDir: tmpDir,
            toolCacheDir: tmpDir,
            codeQLCmd: "",
            gitHubVersion: { type: util.GitHubVariant.DOTCOM },
            dbLocation: path.resolve(tmpDir, "codeql_databases"),
            packs: {},
            debugMode: false,
            debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
            debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
            augmentationProperties: {
                injectedMlQueries: false,
                packsInputCombines: false,
                queriesInputCombines: false,
            },
        };
        analysisPaths.includeAndExcludeAnalysisPaths(config);
        t.is(process.env["LGTM_INDEX_INCLUDE"], "path1\npath2");
        t.is(process.env["LGTM_INDEX_EXCLUDE"], "path4\npath5");
        t.is(process.env["LGTM_INDEX_FILTERS"], "include:path1\ninclude:path2\ninclude:**/path3\nexclude:path4\nexclude:path5\nexclude:path6/**");
    });
});
(0, ava_1.default)("exclude temp dir", async (t) => {
    return await util.withTmpDir(async (toolCacheDir) => {
        const tempDir = path.join(process.cwd(), "codeql-runner-temp");
        const config = {
            languages: [],
            queries: {},
            pathsIgnore: [],
            paths: [],
            originalUserInput: {},
            tempDir,
            toolCacheDir,
            codeQLCmd: "",
            gitHubVersion: { type: util.GitHubVariant.DOTCOM },
            dbLocation: path.resolve(tempDir, "codeql_databases"),
            packs: {},
            debugMode: false,
            debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
            debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
            augmentationProperties: {
                injectedMlQueries: false,
                packsInputCombines: false,
                queriesInputCombines: false,
            },
        };
        analysisPaths.includeAndExcludeAnalysisPaths(config);
        t.is(process.env["LGTM_INDEX_INCLUDE"], undefined);
        t.is(process.env["LGTM_INDEX_EXCLUDE"], "codeql-runner-temp");
        t.is(process.env["LGTM_INDEX_FILTERS"], undefined);
    });
});
//# sourceMappingURL=analysis-paths.test.js.map