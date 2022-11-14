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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cache = __importStar(require("@actions/cache"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const codeql_1 = require("./codeql");
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
const trap_caching_1 = require("./trap-caching");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
const stubCodeql = (0, codeql_1.setCodeQL)({
    async getVersion() {
        return "2.10.3";
    },
    async betterResolveLanguages() {
        return {
            extractors: {
                [languages_1.Language.javascript]: [
                    {
                        extractor_root: "some_root",
                        extractor_options: {
                            trap: {
                                properties: {
                                    cache: {
                                        properties: {
                                            dir: {
                                                title: "Cache directory",
                                            },
                                            bound: {
                                                title: "Cache bound",
                                            },
                                            write: {
                                                title: "Cache write",
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                ],
                [languages_1.Language.cpp]: [
                    {
                        extractor_root: "other_root",
                    },
                ],
            },
        };
    },
});
const testConfigWithoutTmpDir = {
    languages: [languages_1.Language.javascript, languages_1.Language.cpp],
    queries: {},
    pathsIgnore: [],
    paths: [],
    originalUserInput: {},
    tempDir: "",
    codeQLCmd: "",
    gitHubVersion: {
        type: util.GitHubVariant.DOTCOM,
    },
    dbLocation: "",
    packs: {},
    debugMode: false,
    debugArtifactName: util.DEFAULT_DEBUG_ARTIFACT_NAME,
    debugDatabaseName: util.DEFAULT_DEBUG_DATABASE_NAME,
    augmentationProperties: {
        injectedMlQueries: false,
        packsInputCombines: false,
        queriesInputCombines: false,
    },
    trapCaches: {
        javascript: "/some/cache/dir",
    },
    trapCacheDownloadTime: 0,
};
function getTestConfigWithTempDir(tmpDir) {
    return {
        languages: [languages_1.Language.javascript, languages_1.Language.ruby],
        queries: {},
        pathsIgnore: [],
        paths: [],
        originalUserInput: {},
        tempDir: tmpDir,
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
        trapCaches: {
            javascript: path.resolve(tmpDir, "jsCache"),
            ruby: path.resolve(tmpDir, "rubyCache"),
        },
        trapCacheDownloadTime: 0,
    };
}
(0, ava_1.default)("check flags for JS, analyzing default branch", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfigWithTempDir(tmpDir);
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
        const result = await (0, trap_caching_1.getTrapCachingExtractorConfigArgsForLang)(config, languages_1.Language.javascript);
        t.deepEqual(result, [
            `-O=javascript.trap.cache.dir=${path.resolve(tmpDir, "jsCache")}`,
            "-O=javascript.trap.cache.bound=1024",
            "-O=javascript.trap.cache.write=true",
        ]);
    });
});
(0, ava_1.default)("check flags for all, not analyzing default branch", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfigWithTempDir(tmpDir);
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(false);
        const result = await (0, trap_caching_1.getTrapCachingExtractorConfigArgs)(config);
        t.deepEqual(result, [
            `-O=javascript.trap.cache.dir=${path.resolve(tmpDir, "jsCache")}`,
            "-O=javascript.trap.cache.bound=1024",
            "-O=javascript.trap.cache.write=false",
            `-O=ruby.trap.cache.dir=${path.resolve(tmpDir, "rubyCache")}`,
            "-O=ruby.trap.cache.bound=1024",
            "-O=ruby.trap.cache.write=false",
        ]);
    });
});
(0, ava_1.default)("get languages that support TRAP caching", async (t) => {
    const loggedMessages = [];
    const logger = (0, testing_utils_1.getRecordingLogger)(loggedMessages);
    const languagesSupportingCaching = await (0, trap_caching_1.getLanguagesSupportingCaching)(stubCodeql, [languages_1.Language.javascript, languages_1.Language.cpp], logger);
    t.deepEqual(languagesSupportingCaching, [languages_1.Language.javascript]);
});
(0, ava_1.default)("upload cache key contains right fields", async (t) => {
    const loggedMessages = [];
    const logger = (0, testing_utils_1.getRecordingLogger)(loggedMessages);
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
    sinon.stub(util, "tryGetFolderBytes").resolves(999999999);
    const stubSave = sinon.stub(cache, "saveCache");
    process.env.GITHUB_SHA = "somesha";
    await (0, trap_caching_1.uploadTrapCaches)(stubCodeql, testConfigWithoutTmpDir, logger);
    t.assert(stubSave.calledOnceWith(sinon.match.array.contains(["/some/cache/dir"]), sinon
        .match("somesha")
        .and(sinon.match("2.10.3"))
        .and(sinon.match("javascript"))));
});
(0, ava_1.default)("download cache looks for the right key and creates dir", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const loggedMessages = [];
        const logger = (0, testing_utils_1.getRecordingLogger)(loggedMessages);
        sinon.stub(actionsUtil, "getTemporaryDirectory").returns(tmpDir);
        sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(false);
        const stubRestore = sinon.stub(cache, "restoreCache").resolves("found");
        const eventFile = path.resolve(tmpDir, "event.json");
        process.env.GITHUB_EVENT_NAME = "pull_request";
        process.env.GITHUB_EVENT_PATH = eventFile;
        fs.writeFileSync(eventFile, JSON.stringify({
            pull_request: {
                base: {
                    sha: "somesha",
                },
            },
        }));
        await (0, trap_caching_1.downloadTrapCaches)(stubCodeql, [languages_1.Language.javascript, languages_1.Language.cpp], logger);
        t.assert(stubRestore.calledOnceWith(sinon.match.array.contains([
            path.resolve(tmpDir, "trapCaches", "javascript"),
        ]), sinon
            .match("somesha")
            .and(sinon.match("2.10.3"))
            .and(sinon.match("javascript"))));
        t.assert(fs.existsSync(path.resolve(tmpDir, "trapCaches", "javascript")));
    });
});
//# sourceMappingURL=trap-caching.test.js.map