import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { getRunnerLogger } from "./logging";
import * as setupCodeql from "./setup-codeql";
import {
  LINKED_CLI_VERSION,
  LoggedMessage,
  SAMPLE_DEFAULT_CLI_VERSION,
  SAMPLE_DOTCOM_API_DETAILS,
  getRecordingLogger,
  mockBundleDownloadApi,
  setupActionsVars,
  setupTests,
} from "./testing-utils";
import {
  GitHubVariant,
  initializeEnvironment,
  withTmpDir,
  wrapError,
} from "./util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
});

test("parse codeql bundle url version", (t) => {
  t.deepEqual(
    setupCodeql.getCodeQLURLVersion(
      "https://github.com/.../codeql-bundle-20200601/...",
    ),
    "20200601",
  );
});

test("convert to semver", (t) => {
  const tests = {
    "20200601": "0.0.0-20200601",
    "20200601.0": "0.0.0-20200601.0",
    "20200601.0.0": "20200601.0.0",
    "1.2.3": "1.2.3",
    "1.2.3-alpha": "1.2.3-alpha",
    "1.2.3-beta.1": "1.2.3-beta.1",
  };

  for (const [version, expectedVersion] of Object.entries(tests)) {
    try {
      const parsedVersion = setupCodeql.convertToSemVer(
        version,
        getRunnerLogger(true),
      );
      t.deepEqual(parsedVersion, expectedVersion);
    } catch (e) {
      t.fail(wrapError(e).message);
    }
  }
});

test("getCodeQLActionRepository", (t) => {
  const logger = getRunnerLogger(true);

  initializeEnvironment("1.2.3");

  // isRunningLocalAction() === true
  delete process.env["GITHUB_ACTION_REPOSITORY"];
  process.env["RUNNER_TEMP"] = path.dirname(__dirname);
  const repoLocalRunner = setupCodeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoLocalRunner, "github/codeql-action");

  // isRunningLocalAction() === false
  sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
  process.env["GITHUB_ACTION_REPOSITORY"] = "xxx/yyy";
  const repoEnv = setupCodeql.getCodeQLActionRepository(logger);
  t.deepEqual(repoEnv, "xxx/yyy");
});

test("getCodeQLSource sets CLI version for a semver tagged bundle", async (t) => {
  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const tagName = "codeql-bundle-v1.2.3";
    mockBundleDownloadApi({ tagName });
    const source = await setupCodeql.getCodeQLSource(
      `https://github.com/github/codeql-action/releases/download/${tagName}/codeql-bundle-linux64.tar.gz`,
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      getRunnerLogger(true),
    );

    t.is(source.sourceType, "download");
    t.is(source["cliVersion"], "1.2.3");
  });
});

test("getCodeQLSource correctly returns bundled CLI version when tools == linked", async (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const source = await setupCodeql.getCodeQLSource(
      "linked",
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      logger,
    );

    // Assert first that we got the right version of the CodeQL CLI,
    // and that we're sourcing it using the correct method for that.
    t.is(source.toolsVersion, LINKED_CLI_VERSION.cliVersion);
    t.is(source.sourceType, "download");

    // Ensure that we're adequately notifying the user of the version we're using.
    const expected_message: LoggedMessage = {
      type: "info",
      message: `Using CodeQL CLI version: ${LINKED_CLI_VERSION.cliVersion} from download.`,
    };

    loggedMessages.forEach((msg) => {
      console.log(msg.message);
    });

    t.assert(loggedMessages.includes(expected_message));
  });
});

test("getCodeQLSource correctly returns bundled CLI version when tools == latest", async (t) => {
  const loggedMessages = [];
  const logger = getRecordingLogger(loggedMessages);

  await withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    const source = await setupCodeql.getCodeQLSource(
      "latest",
      SAMPLE_DEFAULT_CLI_VERSION,
      SAMPLE_DOTCOM_API_DETAILS,
      GitHubVariant.DOTCOM,
      logger,
    );

    t.is(source.toolsVersion, LINKED_CLI_VERSION.cliVersion);
    t.is(source.sourceType, "download");
  });
});
