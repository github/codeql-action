import * as githubUtils from "@actions/github/lib/utils";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import { getApiClient, GitHubApiCombinedDetails } from "./api-client";
import { setupTests } from "./testing-utils";
import { initializeEnvironment } from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

setupTests(test);

let pluginStub: sinon.SinonStub;
let githubStub: sinon.SinonStub;

test.beforeEach(() => {
  pluginStub = sinon.stub(githubUtils.GitHub, "plugin");
  githubStub = sinon.stub();
  pluginStub.returns(githubStub);
  initializeEnvironment(pkg.version);
});

test("Get the API with an API URL directly", async (t) => {
  doTest(
    t,
    {
      auth: "xyz",
      url: "http://github.localhost",
      apiURL: "http://api.github.localhost",
    },
    undefined,
    {
      auth: "token xyz",
      baseUrl: "http://api.github.localhost",
      userAgent: `CodeQL-Action/${pkg.version}`,
    }
  );
});

function doTest(
  t: ExecutionContext<unknown>,
  clientArgs: GitHubApiCombinedDetails,
  clientOptions: any,
  expected: any
) {
  getApiClient(clientArgs, clientOptions);

  const firstCallArgs = githubStub.args[0];
  // log is a function, so we don't need to test for equality of it
  delete firstCallArgs[0].log;
  t.deepEqual(firstCallArgs, [expected]);
}
