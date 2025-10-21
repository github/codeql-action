import * as fs from "fs";

import * as github from "@actions/github";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { AnalysisKind } from "./analyses";
import { GitHubApiDetails } from "./api-client";
import * as apiClient from "./api-client";
import { createStubCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { uploadDatabases } from "./database-upload";
import * as gitUtils from "./git-utils";
import { KnownLanguage } from "./languages";
import { RepositoryNwo } from "./repository";
import {
  createTestConfig,
  getRecordingLogger,
  LoggedMessage,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import {
  GitHubVariant,
  HTTPError,
  initializeEnvironment,
  withTmpDir,
} from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
});

const testRepoName: RepositoryNwo = { owner: "github", repo: "example" };
const testApiDetails: GitHubApiDetails = {
  auth: "1234",
  url: "https://github.com",
  apiURL: undefined,
};

function getTestConfig(tmpDir: string): Config {
  return createTestConfig({
    languages: [KnownLanguage.javascript],
    dbLocation: tmpDir,
  });
}

async function mockHttpRequests(databaseUploadStatusCode: number) {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");

  const requestSpy = sinon.stub(client, "request");

  const url =
    "POST /repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name&commit_oid=:commit_oid";
  const databaseUploadSpy = requestSpy.withArgs(url);
  if (databaseUploadStatusCode < 300) {
    databaseUploadSpy.resolves(undefined);
  } else {
    databaseUploadSpy.throws(
      new HTTPError("some error message", databaseUploadStatusCode),
    );
  }

  sinon.stub(apiClient, "getApiClient").value(() => client);

  return databaseUploadSpy;
}

function getCodeQL() {
  return createStubCodeQL({
    async databaseBundle(_: string, outputFilePath: string) {
      fs.writeFileSync(outputFilePath, "");
    },
    async databaseCleanupCluster() {
      // Do nothing, as we are not testing cleanup here.
    },
  });
}

test("Abort database upload if 'upload-database' input set to false", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("false");
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    const loggedMessages = [];
    await uploadDatabases(
      testRepoName,
      getCodeQL(),
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages),
    );
    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message ===
            "Database upload disabled in workflow. Skipping upload.",
      ) !== undefined,
    );
  });
});

test("Abort database upload if 'analysis-kinds: code-scanning' is not enabled", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    await mockHttpRequests(201);

    const loggedMessages = [];
    await uploadDatabases(
      testRepoName,
      getCodeQL(),
      {
        ...getTestConfig(tmpDir),
        analysisKinds: [AnalysisKind.CodeQuality],
      },
      testApiDetails,
      getRecordingLogger(loggedMessages),
    );
    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message ===
            "Not uploading database because 'analysis-kinds: code-scanning' is not enabled.",
      ) !== undefined,
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
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    const config = getTestConfig(tmpDir);
    config.gitHubVersion = { type: GitHubVariant.GHES, version: "3.0" };

    const loggedMessages = [];
    await uploadDatabases(
      testRepoName,
      getCodeQL(),
      config,
      testApiDetails,
      getRecordingLogger(loggedMessages),
    );
    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message ===
            "Not running against github.com or GHEC-DR. Skipping upload.",
      ) !== undefined,
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
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(false);

    const loggedMessages = [];
    await uploadDatabases(
      testRepoName,
      getCodeQL(),
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages),
    );
    t.assert(
      loggedMessages.find(
        (v: LoggedMessage) =>
          v.type === "debug" &&
          v.message === "Not analyzing default branch. Skipping upload.",
      ) !== undefined,
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
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    await mockHttpRequests(500);

    const loggedMessages = [] as LoggedMessage[];
    await uploadDatabases(
      testRepoName,
      getCodeQL(),
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages),
    );

    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "warning" &&
          v.message ===
            "Failed to upload database for javascript: Error: some error message",
      ) !== undefined,
    );
  });
});

test("Successfully uploading a database to github.com", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    await mockHttpRequests(201);

    const loggedMessages = [] as LoggedMessage[];
    await uploadDatabases(
      testRepoName,
      getCodeQL(),
      getTestConfig(tmpDir),
      testApiDetails,
      getRecordingLogger(loggedMessages),
    );
    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "debug" &&
          v.message === "Successfully uploaded database for javascript",
      ) !== undefined,
    );
  });
});

test("Successfully uploading a database to GHEC-DR", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    const databaseUploadSpy = await mockHttpRequests(201);

    const loggedMessages = [] as LoggedMessage[];
    await uploadDatabases(
      testRepoName,
      getCodeQL(),
      getTestConfig(tmpDir),
      {
        auth: "1234",
        url: "https://tenant.ghe.com",
        apiURL: undefined,
      },
      getRecordingLogger(loggedMessages),
    );
    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "debug" &&
          v.message === "Successfully uploaded database for javascript",
      ) !== undefined,
    );
    t.assert(
      databaseUploadSpy.calledOnceWith(
        sinon.match.string,
        sinon.match.has("baseUrl", "https://uploads.tenant.ghe.com"),
      ),
    );
  });
});
