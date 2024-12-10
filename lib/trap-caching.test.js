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
const cache = __importStar(require("@actions/cache"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const apiClient = __importStar(require("./api-client"));
const codeql_1 = require("./codeql");
const feature_flags_1 = require("./feature-flags");
const gitUtils = __importStar(require("./git-utils"));
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const trap_caching_1 = require("./trap-caching");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
const stubCodeql = (0, codeql_1.setCodeQL)({
    async getVersion() {
        return (0, testing_utils_1.makeVersionInfo)("2.10.3");
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
const testConfigWithoutTmpDir = (0, testing_utils_1.createTestConfig)({
    languages: [languages_1.Language.javascript, languages_1.Language.cpp],
    trapCaches: {
        javascript: "/some/cache/dir",
    },
});
function getTestConfigWithTempDir(tempDir) {
    return (0, testing_utils_1.createTestConfig)({
        languages: [languages_1.Language.javascript, languages_1.Language.ruby],
        tempDir,
        dbLocation: path.resolve(tempDir, "codeql_databases"),
        trapCaches: {
            javascript: path.resolve(tempDir, "jsCache"),
            ruby: path.resolve(tempDir, "rubyCache"),
        },
    });
}
(0, ava_1.default)("check flags for JS, analyzing default branch", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const config = getTestConfigWithTempDir(tmpDir);
        sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
        const result = await (0, codeql_1.getTrapCachingExtractorConfigArgsForLang)(config, languages_1.Language.javascript);
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
        sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(false);
        const result = await (0, codeql_1.getTrapCachingExtractorConfigArgs)(config);
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
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
    sinon.stub(util, "tryGetFolderBytes").resolves(999_999_999);
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
        sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(false);
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
(0, ava_1.default)("cleanup removes only old CodeQL TRAP caches", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        // This config specifies that we are analyzing JavaScript and Ruby, but not Swift.
        const config = getTestConfigWithTempDir(tmpDir);
        sinon.stub(gitUtils, "getRef").resolves("refs/heads/main");
        sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
        const listStub = sinon.stub(apiClient, "listActionsCaches").resolves([
            // Should be kept, since it's not relevant to CodeQL. In reality, the API shouldn't return
            // this in the first place, but this is a defensive check.
            {
                id: 1,
                key: "some-other-key",
                created_at: "2024-05-23T14:25:00Z",
                size_in_bytes: 100 * 1024 * 1024,
            },
            // Should be kept, since it's the newest TRAP cache for JavaScript
            {
                id: 2,
                key: "codeql-trap-1-2.0.0-javascript-newest",
                created_at: "2024-04-23T14:25:00Z",
                size_in_bytes: 50 * 1024 * 1024,
            },
            // Should be cleaned up
            {
                id: 3,
                key: "codeql-trap-1-2.0.0-javascript-older",
                created_at: "2024-03-22T14:25:00Z",
                size_in_bytes: 200 * 1024 * 1024,
            },
            // Should be cleaned up
            {
                id: 4,
                key: "codeql-trap-1-2.0.0-javascript-oldest",
                created_at: "2024-02-21T14:25:00Z",
                size_in_bytes: 300 * 1024 * 1024,
            },
            // Should be kept, since it's the newest TRAP cache for Ruby
            {
                id: 5,
                key: "codeql-trap-1-2.0.0-ruby-newest",
                created_at: "2024-02-20T14:25:00Z",
                size_in_bytes: 300 * 1024 * 1024,
            },
            // Should be kept, since we aren't analyzing Swift
            {
                id: 6,
                key: "codeql-trap-1-2.0.0-swift-newest",
                created_at: "2024-02-22T14:25:00Z",
                size_in_bytes: 300 * 1024 * 1024,
            },
            // Should be kept, since we aren't analyzing Swift
            {
                id: 7,
                key: "codeql-trap-1-2.0.0-swift-older",
                created_at: "2024-02-21T14:25:00Z",
                size_in_bytes: 300 * 1024 * 1024,
            },
        ]);
        const deleteStub = sinon.stub(apiClient, "deleteActionsCache").resolves();
        const statusReport = await (0, trap_caching_1.cleanupTrapCaches)(config, (0, testing_utils_1.createFeatures)([feature_flags_1.Feature.CleanupTrapCaches]), (0, logging_1.getRunnerLogger)(true));
        t.is(listStub.callCount, 1);
        t.assert(listStub.calledWithExactly("codeql-trap", "refs/heads/main"));
        t.deepEqual(statusReport, {
            trap_cache_cleanup_size_bytes: 500 * 1024 * 1024,
        });
        t.is(deleteStub.callCount, 2);
        t.assert(deleteStub.calledWithExactly(3));
        t.assert(deleteStub.calledWithExactly(4));
    });
});
//# sourceMappingURL=trap-caching.test.js.map