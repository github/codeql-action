import * as githubUtils from "@actions/github/lib/utils";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { getApiClient } from "./api-client";
import { setupTests } from "./testing-utils";
import * as util from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

setupTests(test);

let pluginStub: sinon.SinonStub;
let githubStub: sinon.SinonStub;

test.beforeEach(() => {
  pluginStub = sinon.stub(githubUtils.GitHub, "plugin");
  githubStub = sinon.stub();
  pluginStub.returns(githubStub);
  util.initializeEnvironment(pkg.version);
});

test("getApiClient", async (t) => {
  sinon.stub(actionsUtil, "getRequiredInput").withArgs("token").returns("xyz");
  const requiredEnvParamStub = sinon.stub(util, "getRequiredEnvParam");
  requiredEnvParamStub
    .withArgs("GITHUB_SERVER_URL")
    .returns("http://github.localhost");
  requiredEnvParamStub
    .withArgs("GITHUB_API_URL")
    .returns("http://api.github.localhost");

  getApiClient();

  t.assert(
    githubStub.calledOnceWithExactly({
      auth: "token xyz",
      baseUrl: "http://api.github.localhost",
      log: sinon.match.any,
      userAgent: `CodeQL-Action/${pkg.version}`,
    })
  );
});
