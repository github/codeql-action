import * as github from "@actions/github";
import * as githubUtils from "@actions/github/lib/utils";
import test from "ava";
import * as sinon from "sinon";
import { ProxyAgent } from "undici";

import * as actionsUtil from "./actions-util";
import * as api from "./api-client";
import { DO_NOT_RETRY_STATUSES } from "./api-client";
import { ActionsEnvVars, RegistryProxyVars } from "./environment";
import { callee, getTestEnv, setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test.beforeEach(() => {
  util.initializeEnvironment(actionsUtil.getActionVersion());
});

test.serial("getApiClient", async (t) => {
  const pluginStub: sinon.SinonStub = sinon.stub(githubUtils.GitHub, "plugin");
  const githubStub: sinon.SinonStub = sinon.stub();
  pluginStub.returns(githubStub);

  const env = getTestEnv();
  env.set(ActionsEnvVars.GITHUB_SERVER_URL, "http://github.localhost");
  env.set(ActionsEnvVars.GITHUB_API_URL, "http://api.github.localhost");

  sinon.stub(actionsUtil, "getRequiredInput").withArgs("token").returns("xyz");

  const apiClient = api.getApiClient(env);
  t.truthy(apiClient);

  t.true(githubStub.calledOnce);
  t.assert(
    githubStub.calledOnceWithExactly({
      auth: "token xyz",
      baseUrl: "http://api.github.localhost",
      log: sinon.match.any,
      userAgent: `CodeQL-Action/${actionsUtil.getActionVersion()}`,
      request: sinon.match.any,
      retry: {
        doNotRetry: DO_NOT_RETRY_STATUSES,
      },
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

test.serial("getGitHubVersion for Dotcom", async (t) => {
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

test.serial("getGitHubVersion for GHES", async (t) => {
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

test.serial("getGitHubVersion for different domain", async (t) => {
  mockGetMetaVersionHeader(undefined);
  const v3 = await api.getGitHubVersionFromApi(api.getApiClient(), {
    auth: "",
    url: "https://ghe.example.com",
    apiURL: undefined,
  });
  t.deepEqual({ type: util.GitHubVariant.DOTCOM }, v3);
});

test.serial("getGitHubVersion for GHEC-DR", async (t) => {
  mockGetMetaVersionHeader("ghe.com");
  const gheDotcom = await api.getGitHubVersionFromApi(api.getApiClient(), {
    auth: "",
    url: "https://foo.ghe.com",
    apiURL: undefined,
  });
  t.deepEqual({ type: util.GitHubVariant.GHEC_DR }, gheDotcom);
});

test("wrapApiConfigurationError doesn't wrap errors it isn't supposed to", (t) => {
  const unwrappedErrors = [
    // We don't reclassify arbitrary errors
    new Error("arbitrary error"),
    // Same goes for arbitrary strings
    "arbitrary error",
    // If an HTTP error doesn't contain a specific error message, we don't wrap it.
    new util.HTTPError("arbitrary HTTP error", 456),
  ];

  for (const unwrappedError of unwrappedErrors) {
    const res = api.wrapApiConfigurationError(unwrappedError);
    t.is(
      res,
      unwrappedError,
      `${util.getErrorMessage(unwrappedError)} should not be wrapped by wrapApiConfigurationError`,
    );
  }
});

test("wrapApiConfigurationError correctly wraps specific configuration errors", (t) => {
  // For other HTTP errors, we wrap them as Configuration errors if they contain
  // specific error messages.
  const httpNotFoundError = new util.HTTPError("commit not found", 404);
  const refNotFoundError = new util.HTTPError(
    "ref 'refs/heads/jitsi' not found in this repository - https://docs.github.com/rest",
    404,
  );
  const apiRateLimitError = new util.HTTPError(
    "API rate limit exceeded for installation",
    403,
  );
  const resourceNotAccessibleError = new util.HTTPError(
    "Resource not accessible by integration",
    403,
  );
  const errorsToWrap = [
    httpNotFoundError,
    refNotFoundError,
    apiRateLimitError,
    resourceNotAccessibleError,
  ];

  for (const errorToWrap of errorsToWrap) {
    const res = api.wrapApiConfigurationError(errorToWrap);
    t.deepEqual(res, new util.ConfigurationError(errorToWrap.message));
  }
});

test("wrapApiConfigurationError wraps token errors", async (t) => {
  const tokenSuggestionMessage =
    "Please check that your token is valid and has the required permissions: contents: read, security-events: write";
  const badCredentialsError = new util.HTTPError("Bad credentials", 401);
  const notFoundError = new util.HTTPError("Not Found", 404);
  const errorsToWrap = [badCredentialsError, notFoundError];

  for (const errorToWrap of errorsToWrap) {
    const res = api.wrapApiConfigurationError(errorToWrap);
    t.deepEqual(res, new util.ConfigurationError(tokenSuggestionMessage));
  }
});

test("wrapApiConfigurationError wraps enablement errors", async (t) => {
  // Enablement errors.
  const enablementErrorMessages = [
    "Code Security must be enabled for this repository to use code scanning",
    "Advanced Security must be enabled for this repository to use code scanning",
    "Code Scanning is not enabled for this repository. Please enable code scanning in the repository settings.",
    "Code quality is not enabled for this repository. Please enable code quality in the repository settings.",
  ];
  const transforms = [
    (msg: string) => msg,
    (msg: string) => msg.toLowerCase(),
    (msg: string) => msg.toLocaleUpperCase(),
  ];

  for (const enablementErrorMessage of enablementErrorMessages) {
    for (const transform of transforms) {
      const enablementError = new util.HTTPError(
        transform(enablementErrorMessage),
        403,
      );
      const res = api.wrapApiConfigurationError(enablementError);
      t.deepEqual(
        res,
        new util.ConfigurationError(
          api.getFeatureEnablementError(enablementError.message),
        ),
      );
    }
  }
});

test("wrapApiConfigurationError doesn't double-wrap errors", async (t) => {
  // This test checks that errors don't get wrapped a second time if `wrapApiConfigurationError`
  // is called on an error that was already wrapped by a previous call to `wrapApiConfigurationError`.
  // Start by calling `wrapApiConfigurationError` on an unwrapped error that should be wrapped:
  const unwrappedError = new util.HTTPError("commit not found", 404);
  const wrappedError = api.wrapApiConfigurationError(unwrappedError);

  // Sanity-check that it was wrapped, as expected.
  t.deepEqual(
    wrappedError,
    new util.ConfigurationError(unwrappedError.message),
  );

  // The result of the second call should be exactly `wrappedError`:
  t.is(api.wrapApiConfigurationError(wrappedError), wrappedError);
});

test("getRegistryProxy - returns undefined if the proxy is not configured", async (t) => {
  const target = callee(api.getRegistryProxy).withArgs();

  // Empty environment.
  await target.passes(t.is, undefined);
  // Only the host.
  await target
    .withEnv(getTestEnv({ [RegistryProxyVars.PROXY_HOST]: "localhost" }))
    .passes(t.is, undefined);
  // Only the port.
  await target
    .withEnv(getTestEnv({ [RegistryProxyVars.PROXY_PORT]: "1234" }))
    .passes(t.is, undefined);
});

test("getRegistryProxy - returns value when both vars are set", async (t) => {
  await callee(api.getRegistryProxy)
    .withArgs()
    .withEnv(
      getTestEnv({
        [RegistryProxyVars.PROXY_HOST]: "localhost",
        [RegistryProxyVars.PROXY_PORT]: "1234",
      }),
    )
    .passes(t.truthy);
});

test("getRegistryProxyConfig - gets the configuration from the env vars", async (t) => {
  const host = "localhost";
  const port = "1234";
  const ca = "cert";

  await callee(api.getRegistryProxyConfig)
    .withArgs()
    .withEnv(
      getTestEnv({
        [RegistryProxyVars.PROXY_HOST]: host,
        [RegistryProxyVars.PROXY_PORT]: port,
        [RegistryProxyVars.PROXY_CA_CERTIFICATE]: ca,
      }),
    )
    .passes(t.like, { host, port, ca });
});

test("makeProxyRequestOptions - returns defaults without custom proxy", async (t) => {
  t.deepEqual(
    api.makeProxyRequestOptions(undefined),
    githubUtils.defaults.request,
  );
});

test("makeProxyRequestOptions - returns fetch with custom proxy", async (t) => {
  const opts = api.makeProxyRequestOptions(
    new ProxyAgent("http://localhost:1080"),
  );
  // Fetch should be different from the defaults.
  t.notDeepEqual(opts?.fetch, githubUtils.defaults.request?.fetch);
  // The options should be the same aside from that.
  t.deepEqual(
    { ...opts, fetch: githubUtils.defaults.request?.fetch },
    githubUtils.defaults.request,
  );
});
