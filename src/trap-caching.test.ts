import * as fs from "fs";
import * as path from "path";

import * as cache from "@actions/cache";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as apiClient from "./api-client";
import {
  setCodeQL,
  getTrapCachingExtractorConfigArgs,
  getTrapCachingExtractorConfigArgsForLang,
} from "./codeql";
import * as configUtils from "./config-utils";
import { Feature } from "./feature-flags";
import * as gitUtils from "./git-utils";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import {
  createFeatures,
  createTestConfig,
  getRecordingLogger,
  makeVersionInfo,
  setupTests,
} from "./testing-utils";
import {
  cleanupTrapCaches,
  downloadTrapCaches,
  getLanguagesSupportingCaching,
  uploadTrapCaches,
} from "./trap-caching";
import * as util from "./util";

setupTests(test);

const stubCodeql = setCodeQL({
  async getVersion() {
    return makeVersionInfo("2.10.3");
  },
  async betterResolveLanguages() {
    return {
      extractors: {
        [Language.javascript]: [
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
        [Language.cpp]: [
          {
            extractor_root: "other_root",
          },
        ],
      },
    };
  },
});

const testConfigWithoutTmpDir = createTestConfig({
  languages: [Language.javascript, Language.cpp],
  trapCaches: {
    javascript: "/some/cache/dir",
  },
});

function getTestConfigWithTempDir(tempDir: string): configUtils.Config {
  return createTestConfig({
    languages: [Language.javascript, Language.ruby],
    tempDir,
    dbLocation: path.resolve(tempDir, "codeql_databases"),
    trapCaches: {
      javascript: path.resolve(tempDir, "jsCache"),
      ruby: path.resolve(tempDir, "rubyCache"),
    },
  });
}

test("check flags for JS, analyzing default branch", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfigWithTempDir(tmpDir);
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
    const result = await getTrapCachingExtractorConfigArgsForLang(
      config,
      Language.javascript,
    );
    t.deepEqual(result, [
      `-O=javascript.trap.cache.dir=${path.resolve(tmpDir, "jsCache")}`,
      "-O=javascript.trap.cache.bound=1024",
      "-O=javascript.trap.cache.write=true",
    ]);
  });
});

test("check flags for all, not analyzing default branch", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfigWithTempDir(tmpDir);
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(false);
    const result = await getTrapCachingExtractorConfigArgs(config);
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

test("get languages that support TRAP caching", async (t) => {
  const loggedMessages = [];
  const logger = getRecordingLogger(loggedMessages);
  const languagesSupportingCaching = await getLanguagesSupportingCaching(
    stubCodeql,
    [Language.javascript, Language.cpp],
    logger,
  );
  t.deepEqual(languagesSupportingCaching, [Language.javascript]);
});

test("upload cache key contains right fields", async (t) => {
  const loggedMessages = [];
  const logger = getRecordingLogger(loggedMessages);
  sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
  sinon.stub(util, "tryGetFolderBytes").resolves(999_999_999);
  const stubSave = sinon.stub(cache, "saveCache");
  process.env.GITHUB_SHA = "somesha";
  await uploadTrapCaches(stubCodeql, testConfigWithoutTmpDir, logger);
  t.assert(
    stubSave.calledOnceWith(
      sinon.match.array.contains(["/some/cache/dir"]),
      sinon
        .match("somesha")
        .and(sinon.match("2.10.3"))
        .and(sinon.match("javascript")),
    ),
  );
});

test("download cache looks for the right key and creates dir", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const loggedMessages = [];
    const logger = getRecordingLogger(loggedMessages);
    sinon.stub(actionsUtil, "getTemporaryDirectory").returns(tmpDir);
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(false);
    const stubRestore = sinon.stub(cache, "restoreCache").resolves("found");
    const eventFile = path.resolve(tmpDir, "event.json");
    process.env.GITHUB_EVENT_NAME = "pull_request";
    process.env.GITHUB_EVENT_PATH = eventFile;
    fs.writeFileSync(
      eventFile,
      JSON.stringify({
        pull_request: {
          base: {
            sha: "somesha",
          },
        },
      }),
    );
    await downloadTrapCaches(
      stubCodeql,
      [Language.javascript, Language.cpp],
      logger,
    );
    t.assert(
      stubRestore.calledOnceWith(
        sinon.match.array.contains([
          path.resolve(tmpDir, "trapCaches", "javascript"),
        ]),
        sinon
          .match("somesha")
          .and(sinon.match("2.10.3"))
          .and(sinon.match("javascript")),
      ),
    );
    t.assert(fs.existsSync(path.resolve(tmpDir, "trapCaches", "javascript")));
  });
});

test("cleanup removes only old CodeQL TRAP caches", async (t) => {
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

    const statusReport = await cleanupTrapCaches(
      config,
      createFeatures([Feature.CleanupTrapCaches]),
      getRunnerLogger(true),
    );

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
