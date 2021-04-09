import * as githubUtils from "@actions/github/lib/utils";
import test, { ExecutionContext } from "ava";
import sinon from "sinon";

import { getApiClient } from "./api-client";
import { setupTests } from "./testing-utils";

setupTests(test);

let githubStub: sinon.SinonStub;

test.beforeEach(() => {
  githubStub = sinon.stub(githubUtils, "GitHub");
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
      userAgent: "CodeQL Action",
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
      userAgent: "CodeQL Action",
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
      userAgent: "CodeQL Action",
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
      userAgent: "CodeQL Action",
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
