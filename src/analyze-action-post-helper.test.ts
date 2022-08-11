import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as analyzeActionPostHelper from "./analyze-action-post-helper";
import * as configUtils from "./config-utils";
import { setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test("post: analyze action with debug mode off", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["RUNNER_TEMP"] = tmpDir;

    const gitHubVersion: util.GitHubVersion = {
      type: util.GitHubVariant.DOTCOM,
    };
    sinon.stub(configUtils, "getConfig").resolves({
      debugMode: false,
      gitHubVersion,
      languages: [],
      packs: [],
    } as unknown as configUtils.Config);

    const uploadSarifSpy = sinon.spy();

    await analyzeActionPostHelper.run(uploadSarifSpy);

    t.assert(uploadSarifSpy.notCalled);
  });
});

test("post: analyze action with debug mode on", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["RUNNER_TEMP"] = tmpDir;

    const gitHubVersion: util.GitHubVersion = {
      type: util.GitHubVariant.DOTCOM,
    };
    sinon.stub(configUtils, "getConfig").resolves({
      debugMode: true,
      gitHubVersion,
      languages: [],
      packs: [],
    } as unknown as configUtils.Config);

    const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
    requiredInputStub.withArgs("output").returns("fake-output-dir");

    const uploadSarifSpy = sinon.spy();

    await analyzeActionPostHelper.run(uploadSarifSpy);

    t.assert(uploadSarifSpy.called);
  });
});
