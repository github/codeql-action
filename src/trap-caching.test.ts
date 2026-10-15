import * as fs from "fs";
import * as path from "path";

import * as cache from "@actions/cache";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import {
  getTrapCachingExtractorConfigArgs,
  getTrapCachingExtractorConfigArgsForLang,
  createStubCodeQL,
} from "./codeql";
import * as configUtils from "./config-utils";
import * as gitUtils from "./git-utils";
import { BuiltInLanguage } from "./languages";
import {
  createTestConfig,
  getRecordingLogger,
  makeVersionInfo,
  setupTests,
} from "./testing-utils";
import {
  downloadTrapCaches,
  getLanguagesSupportingCaching,
  uploadTrapCaches,
} from "./trap-caching";
import * as util from "./util";

setupTests(test);

const stubCodeql = createStubCodeQL({
  async getVersion() {
    return makeVersionInfo("2.10.3");
  },
  async resolveLanguages() {
    return {
      extractors: {
        [BuiltInLanguage.javascript]: [
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
        [BuiltInLanguage.cpp]: [
          {
            extractor_root: "other_root",
          },
        ],
      },
    };
  },
});

const testConfigWithoutTmpDir = createTestConfig({
  languages: [BuiltInLanguage.javascript, BuiltInLanguage.cpp],
  trapCaches: {
    javascript: "/some/cache/dir",
  },
});

function getTestConfigWithTempDir(tempDir: string): configUtils.Config {
  return createTestConfig({
    languages: [BuiltInLanguage.javascript, BuiltInLanguage.ruby],
    tempDir,
    dbLocation: path.resolve(tempDir, "codeql_databases"),
    trapCaches: {
      javascript: path.resolve(tempDir, "jsCache"),
      ruby: path.resolve(tempDir, "rubyCache"),
    },
  });
}

test.serial("check flags for JS, analyzing default branch", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfigWithTempDir(tmpDir);
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
    const result = await getTrapCachingExtractorConfigArgsForLang(
      config,
      BuiltInLanguage.javascript,
    );
    t.deepEqual(result, [
      `-O=javascript.trap.cache.dir=${path.resolve(tmpDir, "jsCache")}`,
      "-O=javascript.trap.cache.bound=1024",
      "-O=javascript.trap.cache.write=true",
    ]);
  });
});

test.serial("check flags for all, not analyzing default branch", async (t) => {
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
    [BuiltInLanguage.javascript, BuiltInLanguage.cpp],
    logger,
  );
  t.deepEqual(languagesSupportingCaching, [BuiltInLanguage.javascript]);
});

test.serial("upload cache key contains right fields", async (t) => {
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

test.serial(
  "download cache looks for the right key and creates dir",
  async (t) => {
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
        [BuiltInLanguage.javascript, BuiltInLanguage.cpp],
        logger,
        undefined,
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
  },
);
