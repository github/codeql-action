import test from "ava";
import * as sinon from "sinon";

import * as configUtils from "./config-utils";
import * as initActionPostHelper from "./init-action-post-helper";
import { setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test("post: init action with debug mode off", async (t) => {
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

    const uploadDatabaseBundleSpy = sinon.spy();
    const uploadLogsSpy = sinon.spy();
    const printDebugLogsSpy = sinon.spy();

    await initActionPostHelper.run(
      uploadDatabaseBundleSpy,
      uploadLogsSpy,
      printDebugLogsSpy
    );

    t.assert(uploadDatabaseBundleSpy.notCalled);
    t.assert(uploadLogsSpy.notCalled);
    t.assert(printDebugLogsSpy.notCalled);
  });
});

test("post: init action with debug mode on", async (t) => {
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

    const uploadDatabaseBundleSpy = sinon.spy();
    const uploadLogsSpy = sinon.spy();
    const printDebugLogsSpy = sinon.spy();

    await initActionPostHelper.run(
      uploadDatabaseBundleSpy,
      uploadLogsSpy,
      printDebugLogsSpy
    );

    t.assert(uploadDatabaseBundleSpy.called);
    t.assert(uploadLogsSpy.called);
    t.assert(printDebugLogsSpy.called);
  });
});
