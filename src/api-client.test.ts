import * as github from "@actions/github";
import * as githubUtils from "@actions/github/lib/utils";
import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import { setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test.beforeEach(() => {
  util.initializeEnvironment(actionsUtil.getActionVersion());
});

test("getApiClient", async (t) => {
  const pluginStub: sinon.SinonStub = sinon.stub(githubUtils.GitHub, "plugin");
  const githubStub: sinon.SinonStub = sinon.stub();
  pluginStub.returns(githubStub);

  sinon.stub(actionsUtil, "getRequiredInput").withArgs("token").returns("xyz");
  const requiredEnvParamStub = sinon.stub(util, "getRequiredEnvParam");
  requiredEnvParamStub
    .withArgs("GITHUB_SERVER_URL")
    .returns("http://github.localhost");
  requiredEnvParamStub
    .withArgs("GITHUB_API_URL")
    .returns("http://api.github.localhost");

  api.getApiClient();

  t.assert(
    githubStub.calledOnceWithExactly({
      auth: "token xyz",
      baseUrl: "http://api.github.localhost",
      log: sinon.match.any,
      userAgent: `CodeQL-Action/${actionsUtil.getActionVersion()}`,
    }),
  );
});

function mockGetMetaVersionHeader(
  versionHeader: string | undefined,
): sinon.SinonStub<any, any> {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");
  const response = {
    headers: {
      "x-github-enterprise-version": versionHeader,
    },
  };
  const spyGetContents = sinon
    .stub(client.rest.meta, "get")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    .resolves(response as any);
  sinon.stub(api, "getApiClient").value(() => client);
  return spyGetContents;
}

test("getGitHubVersion for Dotcom", async (t) => {
  const apiDetails = {
    auth: "",
    url: "https://github.com",
    apiURL: "",
  };
  sinon.stub(api, "getApiDetails").returns(apiDetails);
  const v = await api.getGitHubVersionFromApi(
    github.getOctokit("123"),
    apiDetails,
  );
  t.deepEqual(util.GitHubVariant.DOTCOM, v.type);
});

test("getGitHubVersion for GHES", async (t) => {
  mockGetMetaVersionHeader("2.0");
  const v2 = await api.getGitHubVersionFromApi(api.getApiClient(), {
    auth: "",
    url: "https://ghe.example.com",
    apiURL: undefined,
  });
  t.deepEqual(
    { type: util.GitHubVariant.GHES, version: "2.0" } as util.GitHubVersion,
    v2,
  );
});

test("getGitHubVersion for different domain", async (t) => {
  mockGetMetaVersionHeader(undefined);
  const v3 = await api.getGitHubVersionFromApi(api.getApiClient(), {
    auth: "",
    url: "https://ghe.example.com",
    apiURL: undefined,
  });
  t.deepEqual({ type: util.GitHubVariant.DOTCOM }, v3);
});

test("getGitHubVersion for GHE_DOTCOM", async (t) => {
  mockGetMetaVersionHeader("ghe.com");
  const gheDotcom = await api.getGitHubVersionFromApi(api.getApiClient(), {
    auth: "",
    url: "https://foo.ghe.com",
    apiURL: undefined,
  });
  t.deepEqual({ type: util.GitHubVariant.GHE_DOTCOM }, gheDotcom);
});
