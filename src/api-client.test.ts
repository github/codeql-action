import * as githubUtils from "@actions/github/lib/utils";
import test, { ExecutionContext } from "ava";
import sinon from "sinon";

import { getApiClient } from "./api-client";
import { setupTests } from "./testing-utils";
import { Mode, initializeEnvironment } from "./util";

// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");

setupTests(test);

let pluginStub: sinon.SinonStub;
let githubStub: sinon.SinonStub;

test.beforeEach(() => {
  pluginStub = sinon.stub(githubUtils.GitHub, "plugin");
  githubStub = sinon.stub();
  pluginStub.returns(githubStub);
  initializeEnvironment(Mode.actions, pkg.version);
});

test("Get the client API", async (t) => {
  doTest(
    t,
    {
      auth: "xyz",
      externalRepoAuth: "abc",
      url: "http://hucairz",
    },
    undefined,
    {
      auth: "token xyz",
      baseUrl: "http://hucairz/api/v3",
      userAgent: `CodeQL-Action/${pkg.version}`,
    }
  );
});

test("Get the client API external", async (t) => {
  doTest(
    t,
    {
      auth: "xyz",
      externalRepoAuth: "abc",
      url: "http://hucairz",
    },
    { allowExternal: true },
    {
      auth: "token abc",
      baseUrl: "http://hucairz/api/v3",
      userAgent: `CodeQL-Action/${pkg.version}`,
    }
  );
});

test("Get the client API external not present", async (t) => {
  doTest(
    t,
    {
      auth: "xyz",
      url: "http://hucairz",
    },
    { allowExternal: true },
    {
      auth: "token xyz",
      baseUrl: "http://hucairz/api/v3",
      userAgent: `CodeQL-Action/${pkg.version}`,
    }
  );
});

test("Get the client API with github url", async (t) => {
  doTest(
    t,
    {
      auth: "xyz",
      url: "https://github.com/some/invalid/url",
    },
    undefined,
    {
      auth: "token xyz",
      baseUrl: "https://api.github.com",
      userAgent: `CodeQL-Action/${pkg.version}`,
    }
  );
});

function doTest(
  t: ExecutionContext<unknown>,
  clientArgs: any,
  clientOptions: any,
  expected: any
) {
  getApiClient(clientArgs, clientOptions);

  const firstCallArgs = githubStub.args[0];
  // log is a function, so we don't need to test for equality of it
  delete firstCallArgs[0].log;
  t.deepEqual(firstCallArgs, [expected]);
}
