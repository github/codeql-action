import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as analyze from "./analyze";
import * as api from "./api-client";
import * as configUtils from "./config-utils";
import * as gitUtils from "./git-utils";
import * as statusReport from "./status-report";
import {
  setupTests,
  setupActionsVars,
  mockFeatureFlagApiEndpoint,
} from "./testing-utils";
import * as util from "./util";

setupTests(test);

// This test needs to be in its own file so that ava would run it in its own
// nodejs process. The code being tested is in analyze-action.ts, which runs
// immediately on load. So the file needs to be loaded during part of the test,
// and that can happen only once per nodejs process. If multiple such tests are
// in the same test file, ava would run them in the same nodejs process, and all
// but the first test would fail.

test("analyze action with RAM & threads from action inputs", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_SERVER_URL"] = util.GITHUB_DOTCOM_URL;
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["GITHUB_API_URL"] = "https://api.github.com";
    sinon
      .stub(statusReport, "createStatusReportBase")
      .resolves({} as statusReport.StatusReportBase);
    sinon.stub(statusReport, "sendStatusReport").resolves();
    const gitHubVersion: util.GitHubVersion = {
      type: util.GitHubVariant.DOTCOM,
    };
    sinon.stub(configUtils, "getConfig").resolves({
      gitHubVersion,
      languages: [],
      packs: [],
      trapCaches: {},
    } as unknown as configUtils.Config);
    const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
    requiredInputStub.withArgs("token").returns("fake-token");
    requiredInputStub.withArgs("upload-database").returns("false");
    const optionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
    optionalInputStub.withArgs("cleanup-level").returns("none");
    optionalInputStub.withArgs("expect-error").returns("false");
    sinon.stub(api, "getGitHubVersion").resolves(gitHubVersion);
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
    setupActionsVars(tmpDir, tmpDir);
    mockFeatureFlagApiEndpoint(200, {});

    process.env["CODEQL_THREADS"] = "1";
    process.env["CODEQL_RAM"] = "4992";

    // Action inputs have precedence over environment variables.
    optionalInputStub.withArgs("threads").returns("-1");
    optionalInputStub.withArgs("ram").returns("3012");

    const runFinalizeStub = sinon.stub(analyze, "runFinalize");
    const runQueriesStub = sinon.stub(analyze, "runQueries");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const analyzeAction = require("./analyze-action");

    // When analyze-action.ts loads, it runs an async function from the top
    // level but does not wait for it to finish. To ensure that calls to
    // runFinalize and runQueries are correctly captured by spies, we explicitly
    // wait for the action promise to complete before starting verification.
    await analyzeAction.runPromise;

    t.deepEqual(runFinalizeStub.firstCall.args[1], "--threads=-1");
    t.deepEqual(runFinalizeStub.firstCall.args[2], "--ram=3012");
    t.deepEqual(runQueriesStub.firstCall.args[3], "--threads=-1");
    t.deepEqual(runQueriesStub.firstCall.args[1], "--ram=3012");
  });
});
