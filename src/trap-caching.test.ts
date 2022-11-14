import * as fs from "fs";
import * as path from "path";

import * as cache from "@actions/cache";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { setCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { Config } from "./config-utils";
import { Language } from "./languages";
import { getRecordingLogger, setupTests } from "./testing-utils";
import {
  downloadTrapCaches,
  getLanguagesSupportingCaching,
  getTrapCachingExtractorConfigArgs,
  getTrapCachingExtractorConfigArgsForLang,
  uploadTrapCaches,
} from "./trap-caching";
import * as util from "./util";

setupTests(test);

const stubCodeql = setCodeQL({
  async getVersion() {
    return "2.10.3";
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

const testConfigWithoutTmpDir: Config = {
  languages: [Language.javascript, Language.cpp],
  queries: {},
  pathsIgnore: [],
  paths: [],
  originalUserInput: {},
  tempDir: "",
  codeQLCmd: "",
  gitHubVersion: {
    type: util.GitHubVariant.DOTCOM,
  } as util.GitHubVersion,
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

function getTestConfigWithTempDir(tmpDir: string): configUtils.Config {
  return {
    languages: [Language.javascript, Language.ruby],
    queries: {},
    pathsIgnore: [],
    paths: [],
    originalUserInput: {},
    tempDir: tmpDir,
    codeQLCmd: "",
    gitHubVersion: { type: util.GitHubVariant.DOTCOM } as util.GitHubVersion,
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

test("check flags for JS, analyzing default branch", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const config = getTestConfigWithTempDir(tmpDir);
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
    const result = await getTrapCachingExtractorConfigArgsForLang(
      config,
      Language.javascript
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
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(false);
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
    logger
  );
  t.deepEqual(languagesSupportingCaching, [Language.javascript]);
});

test("upload cache key contains right fields", async (t) => {
  const loggedMessages = [];
  const logger = getRecordingLogger(loggedMessages);
  sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);
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
        .and(sinon.match("javascript"))
    )
  );
});

test("download cache looks for the right key and creates dir", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const loggedMessages = [];
    const logger = getRecordingLogger(loggedMessages);
    sinon.stub(actionsUtil, "getTemporaryDirectory").returns(tmpDir);
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(false);
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
      })
    );
    await downloadTrapCaches(
      stubCodeql,
      [Language.javascript, Language.cpp],
      logger
    );
    t.assert(
      stubRestore.calledOnceWith(
        sinon.match.array.contains([
          path.resolve(tmpDir, "trapCaches", "javascript"),
        ]),
        sinon
          .match("somesha")
          .and(sinon.match("2.10.3"))
          .and(sinon.match("javascript"))
      )
    );
    t.assert(fs.existsSync(path.resolve(tmpDir, "trapCaches", "javascript")));
  });
});
