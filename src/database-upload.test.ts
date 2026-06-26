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
import { cleanupAndUploadDatabases } from "./database-upload";
import { Feature } from "./feature-flags";
import * as gitUtils from "./git-utils";
import { BuiltInLanguage } from "./languages";
import { OverlayDatabaseMode } from "./overlay/overlay-database-mode";
import { RepositoryNwo } from "./repository";
import {
  checkExpectedLogMessages,
  createFeatures,
  createTestConfig,
  getRecordingLogger,
  LoggedMessage,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import {
  CleanupLevel,
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
    languages: [BuiltInLanguage.javascript],
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

test.serial(
  "Abort database upload if 'upload-database' input set to false",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("upload-database")
        .returns("false");
      sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

      const loggedMessages: LoggedMessage[] = [];
      await cleanupAndUploadDatabases(
        testRepoName,
        getCodeQL(),
        getTestConfig(tmpDir),
        testApiDetails,
        createFeatures([]),
        getRecordingLogger(loggedMessages),
      );
      checkExpectedLogMessages(t, loggedMessages, [
        "Database upload disabled in workflow. Skipping upload.",
      ]);
    });
  },
);

test.serial(
  "Abort database upload if 'analysis-kinds: code-scanning' is not enabled",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("upload-database")
        .returns("true");
      sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

      await mockHttpRequests(201);

      const loggedMessages: LoggedMessage[] = [];
      await cleanupAndUploadDatabases(
        testRepoName,
        getCodeQL(),
        {
          ...getTestConfig(tmpDir),
          analysisKinds: [AnalysisKind.CodeQuality],
        },
        testApiDetails,
        createFeatures([]),
        getRecordingLogger(loggedMessages),
      );
      checkExpectedLogMessages(t, loggedMessages, [
        "Not uploading database because 'analysis-kinds: code-scanning' is not enabled.",
      ]);
    });
  },
);

test.serial("Abort database upload if running against GHES", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    const config = getTestConfig(tmpDir);
    config.gitHubVersion = { type: GitHubVariant.GHES, version: "3.0" };

    const loggedMessages: LoggedMessage[] = [];
    await cleanupAndUploadDatabases(
      testRepoName,
      getCodeQL(),
      config,
      testApiDetails,
      createFeatures([]),
      getRecordingLogger(loggedMessages),
    );
    checkExpectedLogMessages(t, loggedMessages, [
      "Not running against github.com or GHEC-DR. Skipping upload.",
    ]);
  });
});

test.serial(
  "Abort database upload if not analyzing default branch",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("upload-database")
        .returns("true");
      sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(false);

      const loggedMessages: LoggedMessage[] = [];
      await cleanupAndUploadDatabases(
        testRepoName,
        getCodeQL(),
        getTestConfig(tmpDir),
        testApiDetails,
        createFeatures([]),
        getRecordingLogger(loggedMessages),
      );
      checkExpectedLogMessages(t, loggedMessages, [
        "Not analyzing default branch. Skipping upload.",
      ]);
    });
  },
);

test.serial(
  "Don't crash if uploading a database fails with a non-retryable error",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("upload-database")
        .returns("true");
      sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

      const databaseUploadSpy = await mockHttpRequests(422);

      const loggedMessages: LoggedMessage[] = [];
      await cleanupAndUploadDatabases(
        testRepoName,
        getCodeQL(),
        getTestConfig(tmpDir),
        testApiDetails,
        createFeatures([]),
        getRecordingLogger(loggedMessages),
      );

      checkExpectedLogMessages(t, loggedMessages, [
        "Failed to upload database for javascript: some error message",
      ]);

      // Non-retryable errors should not be retried.
      t.is(databaseUploadSpy.callCount, 1);
    });
  },
);

test.serial(
  "Don't crash if uploading a database fails with a retryable error",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("upload-database")
        .returns("true");
      sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

      const databaseUploadSpy = await mockHttpRequests(500);

      // Stub setTimeout to fire immediately to avoid real delays from retry backoff.
      const originalSetTimeout = global.setTimeout;
      const setTimeoutStub = sinon
        .stub(global, "setTimeout")
        .callsFake((fn: () => void) => originalSetTimeout(fn, 0));

      const loggedMessages: LoggedMessage[] = [];
      await cleanupAndUploadDatabases(
        testRepoName,
        getCodeQL(),
        getTestConfig(tmpDir),
        testApiDetails,
        createFeatures([]),
        getRecordingLogger(loggedMessages),
      );

      checkExpectedLogMessages(t, loggedMessages, [
        "Failed to upload database for javascript: some error message",
      ]);

      // Retryable errors should be retried the expected number of times.
      t.is(databaseUploadSpy.callCount, 4);

      // setTimeout should have been called with the expected backoff delays.
      const setTimeoutDelays = setTimeoutStub.args.map(
        (args) => args[1] as number,
      );
      t.deepEqual(setTimeoutDelays, [15_000, 30_000, 60_000]);
    });
  },
);

test.serial("Successfully uploading a database to github.com", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    await mockHttpRequests(201);

    const loggedMessages: LoggedMessage[] = [];
    await cleanupAndUploadDatabases(
      testRepoName,
      getCodeQL(),
      getTestConfig(tmpDir),
      testApiDetails,
      createFeatures([]),
      getRecordingLogger(loggedMessages),
    );
    checkExpectedLogMessages(t, loggedMessages, [
      "Successfully uploaded database for javascript",
    ]);
  });
});

test.serial("Successfully uploading a database to GHEC-DR", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    const databaseUploadSpy = await mockHttpRequests(201);

    const loggedMessages: LoggedMessage[] = [];
    await cleanupAndUploadDatabases(
      testRepoName,
      getCodeQL(),
      getTestConfig(tmpDir),
      {
        auth: "1234",
        url: "https://tenant.ghe.com",
        apiURL: undefined,
      },
      createFeatures([]),
      getRecordingLogger(loggedMessages),
    );
    checkExpectedLogMessages(t, loggedMessages, [
      "Successfully uploaded database for javascript",
    ]);
    t.assert(
      databaseUploadSpy.calledOnceWith(
        sinon.match.string,
        sinon.match.has("baseUrl", "https://uploads.tenant.ghe.com"),
      ),
    );
  });
});

test.serial(
  "Records overlay and clear cleanup sizes when uploading an overlay-base database",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("upload-database")
        .returns("true");
      sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

      await mockHttpRequests(201);

      // Track the cleanup level passed to each cleanup so that the database
      // bundle stub can write a differently-sized bundle for each level.
      const cleanupLevels: CleanupLevel[] = [];
      let lastCleanupLevel: CleanupLevel | undefined;
      const overlaySizeBytes = 100;
      const clearSizeBytes = 50;
      const codeql = createStubCodeQL({
        async databaseCleanupCluster(_config, cleanupLevel) {
          cleanupLevels.push(cleanupLevel);
          lastCleanupLevel = cleanupLevel;
        },
        async databaseBundle(_databasePath, outputFilePath) {
          const sizeBytes =
            lastCleanupLevel === CleanupLevel.Overlay
              ? overlaySizeBytes
              : clearSizeBytes;
          fs.writeFileSync(outputFilePath, "x".repeat(sizeBytes));
        },
      });

      const config = getTestConfig(tmpDir);
      config.overlayDatabaseMode = OverlayDatabaseMode.OverlayBase;

      const loggedMessages: LoggedMessage[] = [];
      const results = await cleanupAndUploadDatabases(
        testRepoName,
        codeql,
        config,
        testApiDetails,
        createFeatures([Feature.UploadOverlayDbToApi]),
        getRecordingLogger(loggedMessages),
      );

      // The database should be cleaned up at the `overlay` level for the upload
      // and then re-cleaned at the `clear` level to measure its size.
      t.deepEqual(cleanupLevels, [CleanupLevel.Overlay, CleanupLevel.Clear]);

      t.is(results.length, 1);
      t.is(results[0].is_overlay_base, true);
      t.is(results[0].zipped_upload_size_bytes, overlaySizeBytes);
      t.is(results[0].clear_cleanup_zipped_size_bytes, clearSizeBytes);
      t.is(typeof results[0].clear_cleanup_measurement_duration_ms, "number");
    });
  },
);

test.serial(
  "Does not measure clear cleanup size for a regular (non-overlay-base) upload",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("upload-database")
        .returns("true");
      sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

      await mockHttpRequests(201);

      const cleanupLevels: CleanupLevel[] = [];
      const codeql = createStubCodeQL({
        async databaseCleanupCluster(_config, cleanupLevel) {
          cleanupLevels.push(cleanupLevel);
        },
        async databaseBundle(_databasePath, outputFilePath) {
          fs.writeFileSync(outputFilePath, "");
        },
      });

      const results = await cleanupAndUploadDatabases(
        testRepoName,
        codeql,
        getTestConfig(tmpDir),
        testApiDetails,
        createFeatures([Feature.UploadOverlayDbToApi]),
        getRecordingLogger([]),
      );

      // A regular upload is cleaned only once, at the `clear` level.
      t.deepEqual(cleanupLevels, [CleanupLevel.Clear]);
      t.is(results[0].is_overlay_base, false);
      t.is(results[0].clear_cleanup_zipped_size_bytes, undefined);
      t.is(results[0].clear_cleanup_measurement_duration_ms, undefined);
    });
  },
);

test.serial("Does not measure clear cleanup size in debug mode", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(actionsUtil, "getRequiredInput")
      .withArgs("upload-database")
      .returns("true");
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

    await mockHttpRequests(201);

    const cleanupLevels: CleanupLevel[] = [];
    const codeql = createStubCodeQL({
      async databaseCleanupCluster(_config, cleanupLevel) {
        cleanupLevels.push(cleanupLevel);
      },
      async databaseBundle(_databasePath, outputFilePath) {
        fs.writeFileSync(outputFilePath, "");
      },
    });

    const config = getTestConfig(tmpDir);
    config.overlayDatabaseMode = OverlayDatabaseMode.OverlayBase;
    config.debugMode = true;

    const results = await cleanupAndUploadDatabases(
      testRepoName,
      codeql,
      config,
      testApiDetails,
      createFeatures([Feature.UploadOverlayDbToApi]),
      getRecordingLogger([]),
    );

    // In debug mode we clean up at the `overlay` level for the upload but skip
    // the additional `clear` cleanup, to preserve the database for debugging.
    t.deepEqual(cleanupLevels, [CleanupLevel.Overlay]);
    t.is(results[0].is_overlay_base, true);
    t.is(results[0].clear_cleanup_zipped_size_bytes, undefined);
    t.is(results[0].clear_cleanup_measurement_duration_ms, undefined);
  });
});

test.serial(
  "Does not record a clear cleanup duration when the clear cleanup fails",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      sinon
        .stub(actionsUtil, "getRequiredInput")
        .withArgs("upload-database")
        .returns("true");
      sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);

      await mockHttpRequests(201);

      const codeql = createStubCodeQL({
        async databaseCleanupCluster(_config, cleanupLevel) {
          if (cleanupLevel === CleanupLevel.Clear) {
            throw new Error("clear cleanup failed");
          }
        },
        async databaseBundle(_databasePath, outputFilePath) {
          fs.writeFileSync(outputFilePath, "x".repeat(100));
        },
      });

      const config = getTestConfig(tmpDir);
      config.overlayDatabaseMode = OverlayDatabaseMode.OverlayBase;

      const results = await cleanupAndUploadDatabases(
        testRepoName,
        codeql,
        config,
        testApiDetails,
        createFeatures([Feature.UploadOverlayDbToApi]),
        getRecordingLogger([]),
      );

      // When the `clear` cleanup fails, no size is measured, so we should not
      // report a measurement duration either.
      t.is(results[0].is_overlay_base, true);
      t.is(results[0].clear_cleanup_zipped_size_bytes, undefined);
      t.is(results[0].clear_cleanup_measurement_duration_ms, undefined);
    });
  },
);
