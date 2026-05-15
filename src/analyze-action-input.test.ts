import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as analyze from "./analyze";
import { runWrapper } from "./analyze-action";
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

test("analyze action with RAM & threads from action inputs", async (t) => {
  t.timeout(1000 * 20);
  await util.withTmpDir(async (tmpDir) => {
    setupActionsVars(tmpDir, tmpDir);
    sinon
      .stub(statusReport, "createStatusReportBase")
      .resolves({} as statusReport.StatusReportBase);
    sinon.stub(statusReport, "sendStatusReport").resolves();
    const gitHubVersion: util.GitHubVersion = {
      type: util.GitHubVariant.DOTCOM,
    };
    sinon.stub(configUtils, "getConfig").resolves({
      gitHubVersion,
      augmentationProperties: {},
      languages: [],
      packs: [],
      trapCaches: {},
    } as unknown as configUtils.Config);
    const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
    requiredInputStub.withArgs("token").returns("fake-token");
    requiredInputStub.withArgs("upload-database").returns("false");
    requiredInputStub.withArgs("output").returns("out");
    const optionalInputStub = sinon.stub(actionsUtil, "getOptionalInput");
    optionalInputStub.withArgs("expect-error").returns("false");
    sinon.stub(api, "getGitHubVersion").resolves(gitHubVersion);
    sinon.stub(gitUtils, "isAnalyzingDefaultBranch").resolves(true);
    mockFeatureFlagApiEndpoint(200, {});

    process.env["CODEQL_THREADS"] = "1";
    process.env["CODEQL_RAM"] = "4992";

    // Action inputs have precedence over environment variables.
    optionalInputStub.withArgs("threads").returns("-1");
    optionalInputStub.withArgs("ram").returns("3012");

    const runFinalizeStub = sinon.stub(analyze, "runFinalize");
    const runQueriesStub = sinon.stub(analyze, "runQueries");

    await runWrapper();

    t.assert(
      runFinalizeStub.calledOnceWith(
        sinon.match.any,
        sinon.match.any,
        "--threads=-1",
        "--ram=3012",
      ),
    );
    t.assert(
      runQueriesStub.calledOnceWith(
        sinon.match.any,
        "--ram=3012",
        "--threads=-1",
      ),
    );
  });
});
