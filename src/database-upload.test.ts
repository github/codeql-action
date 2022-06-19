import * as fs from "fs";

import * as github from "@actions/github";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { GitHubApiDetails } from "./api-client";
import * as apiClient from "./api-client";
import { setCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { uploadDatabases } from "./database-upload";
import { Language } from "./languages";
import { RepositoryNwo } from "./repository";
import {
  getRecordingLogger,
  LoggedMessage,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import {
  DEFAULT_DEBUG_ARTIFACT_NAME,
  DEFAULT_DEBUG_DATABASE_NAME,
  GitHubVariant,
  HTTPError,
  initializeEnvironment,
  Mode,
  withTmpDir,
} from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment(Mode.actions, "1.2.3");
});

const testRepoName: RepositoryNwo = { owner: "github", repo: "example" };
const testApiDetails: GitHubApiDetails = {
  auth: "1234",
  url: "https://github.com",
};

function getTestConfig(tmpDir: string): Config {
  return {
    languages: [Language.javascript],
    queries: {},
    pathsIgnore: [],
    paths: [],
    originalUserInput: {},
    tempDir: tmpDir,
    toolCacheDir: tmpDir,
    codeQLCmd: "foo",
    gitHubVersion: { type: GitHubVariant.DOTCOM },
    dbLocation: tmpDir,
    packs: {},
    debugMode: false,
    debugArtifactName: DEFAULT_DEBUG_ARTIFACT_NAME,
    debugDatabaseName: DEFAULT_DEBUG_DATABASE_NAME,
    augmentationProperties: {
      injectedMlQueries: false,
      packsInputCombines: false,
      queriesInputCombines: false,
    },
  };
}

async function mockHttpRequests(databaseUploadStatusCode: number) {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");

  const requestSpy = sinon.stub(client, "request");

  const url =
    "POST https://uploads.github.com/repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name";
  const databaseUploadSpy = requestSpy.withArgs(url);
  if (databaseUploadStatusCode < 300) {
    databaseUploadSpy.resolves(undefined);
  } else {
    databaseUploadSpy.throws(
      new HTTPError("some error message", databaseUploadStatusCode)
    );
  }

  sinon.stub(apiClient, "getApiClient").value(() => client);
}

test("Abort database upload if 'upload-database' input set to false", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("false");
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);

    const loggedMessages = [];
    await uploadDatabases(
      testRepoName,
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages)
    );
    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message === "Database upload disabled in workflow. Skipping upload."
      ) !== undefined
    );
  });
});

test("Abort database upload if running against GHES", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);

    const config = getTestConfig(tmpDir);
    config.gitHubVersion = { type: GitHubVariant.GHES, version: "3.0" };

    const loggedMessages = [];
    await uploadDatabases(
      testRepoName,
      config,
      testApiDetails,
      getRecordingLogger(loggedMessages)
    );
    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message === "Not running against github.com. Skipping upload."
      ) !== undefined
    );
  });
});

test("Abort database upload if running against GHAE", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);

    const config = getTestConfig(tmpDir);
    config.gitHubVersion = { type: GitHubVariant.GHAE };

    const loggedMessages = [];
    await uploadDatabases(
      testRepoName,
      config,
      testApiDetails,
      getRecordingLogger(loggedMessages)
    );
    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message === "Not running against github.com. Skipping upload."
      ) !== undefined
    );
  });
});

test("Abort database upload if not analyzing default branch", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(false);

    const loggedMessages = [];
    await uploadDatabases(
      testRepoName,
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages)
    );
    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message === "Not analyzing default branch. Skipping upload."
      ) !== undefined
    );
  });
});

test("Don't crash if uploading a database fails", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);

    await mockHttpRequests(500);

    setCodeQL({
      async databaseBundle(_: string, outputFilePath: string) {
        fs.writeFileSync(outputFilePath, "");
      },
    });

    const loggedMessages = [] as LoggedMessage[];
    await uploadDatabases(
      testRepoName,
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages)
    );

    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "warning" &&
          v.message ===
            "Failed to upload database for javascript: Error: some error message"
      ) !== undefined
    );
  });
});

test("Successfully uploading a database to api.github.com", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);

    await mockHttpRequests(201);

    setCodeQL({
      async databaseBundle(_: string, outputFilePath: string) {
        fs.writeFileSync(outputFilePath, "");
      },
    });

    const loggedMessages = [] as LoggedMessage[];
    await uploadDatabases(
      testRepoName,
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages)
    );
    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "debug" &&
          v.message === "Successfully uploaded database for javascript"
      ) !== undefined
    );
  });
});

test("Successfully uploading a database to uploads.github.com", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(actionsUtil, "isAnalyzingDefaultBranch").resolves(true);

    await mockHttpRequests(201);

    setCodeQL({
      async databaseBundle(_: string, outputFilePath: string) {
        fs.writeFileSync(outputFilePath, "");
      },
    });

    const loggedMessages = [] as LoggedMessage[];
    await uploadDatabases(
      testRepoName,
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages)
    );
    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "debug" &&
          v.message === "Successfully uploaded database for javascript"
      ) !== undefined
    );
  });
});
