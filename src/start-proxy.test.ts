import * as filepath from "path";

import * as core from "@actions/core";
import * as toolcache from "@actions/tool-cache";
import test, { ExecutionContext } from "ava";
import sinon from "sinon";

import * as apiClient from "./api-client";
import * as defaults from "./defaults.json";
import { KnownLanguage } from "./languages";
import { getRunnerLogger, Logger } from "./logging";
import * as startProxyExports from "./start-proxy";
import { parseLanguage } from "./start-proxy";
import * as statusReport from "./status-report";
import {
  checkExpectedLogMessages,
  getRecordingLogger,
  makeTestToken,
  setupTests,
  withRecordingLoggerAsync,
} from "./testing-utils";
import { ConfigurationError } from "./util";

setupTests(test);

const sendFailedStatusReportTest = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    err: Error,
    expectedMessage: string,
    expectedStatus: statusReport.ActionStatus = "failure",
  ) => {
    const now = new Date();

    // Override core.setFailed to avoid it setting the program's exit code
    sinon.stub(core, "setFailed").returns();

    const createStatusReportBase = sinon.stub(
      statusReport,
      "createStatusReportBase",
    );
    createStatusReportBase.resolves(undefined);

    await withRecordingLoggerAsync(async (logger) => {
      await startProxyExports.sendFailedStatusReport(
        logger,
        now,
        undefined,
        err,
      );

      // Check that the stub has been called exactly once, with the expected arguments,
      // but not with the message from the error.
      sinon.assert.calledOnceWithExactly(
        createStatusReportBase,
        statusReport.ActionName.StartProxy,
        expectedStatus,
        now,
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        expectedMessage,
      );
      t.false(
        createStatusReportBase.calledWith(
          statusReport.ActionName.StartProxy,
          expectedStatus,
          now,
          sinon.match.any,
          sinon.match.any,
          sinon.match.any,
          sinon.match((msg: string) => msg.includes(err.message)),
        ),
        "createStatusReportBase was called with the error message",
      );
    });
  },

  title: (providedTitle = "") => `sendFailedStatusReport - ${providedTitle}`,
});

test(
  "reports generic error message for non-StartProxyError error",
  sendFailedStatusReportTest,
  new Error("Something went wrong today"),
  "Error from start-proxy Action omitted (Error).",
);

test(
  "reports generic error message for non-StartProxyError error with safe error message",
  sendFailedStatusReportTest,
  new Error(
    startProxyExports.getStartProxyErrorMessage(
      startProxyExports.StartProxyErrorType.DownloadFailed,
    ),
  ),
  "Error from start-proxy Action omitted (Error).",
);

test(
  "reports generic error message for ConfigurationError error",
  sendFailedStatusReportTest,
  new ConfigurationError("Something went wrong today"),
  "Error from start-proxy Action omitted (ConfigurationError).",
  "user-error",
);

const toEncodedJSON = (data: any) =>
  Buffer.from(JSON.stringify(data)).toString("base64");

const mixedCredentials = [
  { type: "npm_registry", host: "npm.pkg.github.com", token: "abc" },
  { type: "maven_repository", host: "maven.pkg.github.com", token: "def" },
  { type: "nuget_feed", host: "nuget.pkg.github.com", token: "ghi" },
  { type: "goproxy_server", host: "goproxy.example.com", token: "jkl" },
  { type: "git_source", host: "github.com/github", token: "mno" },
];

test("getCredentials prefers registriesCredentials over registrySecrets", async (t) => {
  const registryCredentials = Buffer.from(
    JSON.stringify([
      { type: "npm_registry", host: "npm.pkg.github.com", token: "abc" },
    ]),
  ).toString("base64");
  const registrySecrets = JSON.stringify([
    { type: "npm_registry", host: "registry.npmjs.org", token: "def" },
  ]);

  const credentials = startProxyExports.getCredentials(
    getRunnerLogger(true),
    registrySecrets,
    registryCredentials,
    undefined,
  );
  t.is(credentials.length, 1);
  t.is(credentials[0].host, "npm.pkg.github.com");
});

test("getCredentials throws an error when configurations are not an array", async (t) => {
  const registryCredentials = Buffer.from(
    JSON.stringify({ type: "npm_registry", token: "abc" }),
  ).toString("base64");

  t.throws(
    () =>
      startProxyExports.getCredentials(
        getRunnerLogger(true),
        undefined,
        registryCredentials,
        undefined,
      ),
    {
      message:
        "Expected credentials data to be an array of configurations, but it is not.",
    },
  );
});

test("getCredentials throws error when credential is not an object", async (t) => {
  const testCredentials = [["foo"], [null]].map(toEncodedJSON);

  for (const testCredential of testCredentials) {
    t.throws(
      () =>
        startProxyExports.getCredentials(
          getRunnerLogger(true),
          undefined,
          testCredential,
          undefined,
        ),
      {
        message: "Invalid credentials - must be an object",
      },
    );
  }
});

test("getCredentials throws error when credential missing host and url", async (t) => {
  const testCredentials = [
    [{ type: "npm_registry", token: "abc" }],
    [{ type: "npm_registry", token: "abc", host: null }],
    [{ type: "npm_registry", token: "abc", url: null }],
  ].map(toEncodedJSON);

  for (const testCredential of testCredentials) {
    t.throws(
      () =>
        startProxyExports.getCredentials(
          getRunnerLogger(true),
          undefined,
          testCredential,
          undefined,
        ),
      {
        message: "Invalid credentials - must specify host or url",
      },
    );
  }
});

test("getCredentials filters by language when specified", async (t) => {
  const credentials = startProxyExports.getCredentials(
    getRunnerLogger(true),
    undefined,
    toEncodedJSON(mixedCredentials),
    KnownLanguage.java,
  );
  t.is(credentials.length, 1);
  t.is(credentials[0].type, "maven_repository");
});

test("getCredentials returns all for a language when specified", async (t) => {
  const credentials = startProxyExports.getCredentials(
    getRunnerLogger(true),
    undefined,
    toEncodedJSON(mixedCredentials),
    KnownLanguage.go,
  );
  t.is(credentials.length, 2);

  const credentialsTypes = credentials.map((c) => c.type);
  t.assert(credentialsTypes.includes("goproxy_server"));
  t.assert(credentialsTypes.includes("git_source"));
});

test("getCredentials returns all credentials when no language specified", async (t) => {
  const credentialsInput = toEncodedJSON(mixedCredentials);

  const credentials = startProxyExports.getCredentials(
    getRunnerLogger(true),
    undefined,
    credentialsInput,
    undefined,
  );
  t.is(credentials.length, mixedCredentials.length);
});

test("getCredentials throws an error when non-printable characters are used", async (t) => {
  const invalidCredentials = [
    { type: "nuget_feed", host: "1nuget.pkg.github.com", token: "abc\u0000" }, // Non-printable character in token
    { type: "nuget_feed", host: "2nuget.pkg.github.com\u0001" }, // Non-printable character in host
    {
      type: "nuget_feed",
      host: "3nuget.pkg.github.com",
      password: "ghi\u0002",
    }, // Non-printable character in password
    { type: "nuget_feed", host: "4nuget.pkg.github.com", password: "ghi\x00" }, // Non-printable character in password
  ];

  for (const invalidCredential of invalidCredentials) {
    const credentialsInput = Buffer.from(
      JSON.stringify([invalidCredential]),
    ).toString("base64");

    t.throws(
      () =>
        startProxyExports.getCredentials(
          getRunnerLogger(true),
          undefined,
          credentialsInput,
          undefined,
        ),
      {
        message:
          "Invalid credentials - fields must contain only printable characters",
      },
    );
  }
});

test("getCredentials logs a warning when a PAT is used without a username", async (t) => {
  const loggedMessages = [];
  const logger = getRecordingLogger(loggedMessages);
  const likelyWrongCredentials = toEncodedJSON([
    {
      type: "git_server",
      host: "https://github.com/",
      password: `ghp_${makeTestToken()}`,
    },
  ]);

  const results = startProxyExports.getCredentials(
    logger,
    undefined,
    likelyWrongCredentials,
    undefined,
  );

  // The configuration should be accepted, despite the likely problem.
  t.assert(results);
  t.is(results.length, 1);
  t.is(results[0].type, "git_server");
  t.is(results[0].host, "https://github.com/");
  t.assert(results[0].password?.startsWith("ghp_"));

  // A warning should have been logged.
  checkExpectedLogMessages(t, loggedMessages, [
    "using a GitHub Personal Access Token (PAT), but no username was provided",
  ]);
});

test("parseLanguage", async (t) => {
  // Exact matches
  t.deepEqual(parseLanguage("csharp"), KnownLanguage.csharp);
  t.deepEqual(parseLanguage("cpp"), KnownLanguage.cpp);
  t.deepEqual(parseLanguage("go"), KnownLanguage.go);
  t.deepEqual(parseLanguage("java"), KnownLanguage.java);
  t.deepEqual(parseLanguage("javascript"), KnownLanguage.javascript);
  t.deepEqual(parseLanguage("python"), KnownLanguage.python);
  t.deepEqual(parseLanguage("rust"), KnownLanguage.rust);

  // Aliases
  t.deepEqual(parseLanguage("c"), KnownLanguage.cpp);
  t.deepEqual(parseLanguage("c++"), KnownLanguage.cpp);
  t.deepEqual(parseLanguage("c#"), KnownLanguage.csharp);
  t.deepEqual(parseLanguage("kotlin"), KnownLanguage.java);
  t.deepEqual(parseLanguage("typescript"), KnownLanguage.javascript);

  // spaces and case-insensitivity
  t.deepEqual(parseLanguage("  \t\nCsHaRp\t\t"), KnownLanguage.csharp);
  t.deepEqual(parseLanguage("  \t\nkOtLin\t\t"), KnownLanguage.java);

  // Not matches
  t.deepEqual(parseLanguage("foo"), undefined);
  t.deepEqual(parseLanguage(" "), undefined);
  t.deepEqual(parseLanguage(""), undefined);
});

function mockGetReleaseByTag(assets?: Array<{ name: string; url?: string }>) {
  const mockClient = sinon.stub(apiClient, "getApiClient");
  const getReleaseByTag =
    assets === undefined
      ? sinon.stub().rejects()
      : sinon.stub().resolves({
          status: 200,
          data: { assets },
          headers: {},
          url: "GET /repos/:owner/:repo/releases/tags/:tag",
        });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  mockClient.returns({
    rest: {
      repos: {
        getReleaseByTag,
      },
    },
  } as any);
  return mockClient;
}

test("getDownloadUrl returns fallback when `getLinkedRelease` rejects", async (t) => {
  mockGetReleaseByTag();

  const info = await startProxyExports.getDownloadUrl(getRunnerLogger(true));

  t.is(info.version, startProxyExports.UPDATEJOB_PROXY_VERSION);
  t.is(
    info.url,
    startProxyExports.getFallbackUrl(startProxyExports.getProxyPackage()),
  );
});

test("getDownloadUrl returns fallback when there's no matching release asset", async (t) => {
  const testAssets = [[], [{ name: "foo" }]];

  for (const assets of testAssets) {
    const stub = mockGetReleaseByTag(assets);
    const info = await startProxyExports.getDownloadUrl(getRunnerLogger(true));

    t.is(info.version, startProxyExports.UPDATEJOB_PROXY_VERSION);
    t.is(
      info.url,
      startProxyExports.getFallbackUrl(startProxyExports.getProxyPackage()),
    );

    stub.restore();
  }
});

test("getDownloadUrl returns matching release asset", async (t) => {
  const assets = [
    { name: "foo", url: "other-url" },
    { name: startProxyExports.getProxyPackage(), url: "url-we-want" },
  ];
  mockGetReleaseByTag(assets);

  const info = await startProxyExports.getDownloadUrl(getRunnerLogger(true));

  t.is(info.version, defaults.cliVersion);
  t.is(info.url, "url-we-want");
});

test("credentialToStr - hides passwords/tokens", (t) => {
  const secret = "password123";
  const credential = {
    type: "maven_credential",
  };
  t.false(
    startProxyExports
      .credentialToStr({ password: secret, ...credential })
      .includes(secret),
  );
  t.false(
    startProxyExports
      .credentialToStr({ token: secret, ...credential })
      .includes(secret),
  );
});

test("getSafeErrorMessage - returns actual message for `StartProxyError`", (t) => {
  const error = new startProxyExports.StartProxyError(
    startProxyExports.StartProxyErrorType.DownloadFailed,
  );
  t.is(
    startProxyExports.getSafeErrorMessage(error),
    startProxyExports.getStartProxyErrorMessage(error.errorType),
  );
});

test("getSafeErrorMessage - does not return message for arbitrary errors", (t) => {
  const error = new Error(
    startProxyExports.getStartProxyErrorMessage(
      startProxyExports.StartProxyErrorType.DownloadFailed,
    ),
  );

  const message = startProxyExports.getSafeErrorMessage(error);

  t.not(message, error.message);
  t.assert(message.startsWith("Error from start-proxy Action omitted"));
  t.assert(message.includes(error.name));
});

const wrapFailureTest = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    setup: () => void,
    fn: (logger: Logger) => Promise<void>,
  ) => {
    await withRecordingLoggerAsync(async (logger) => {
      setup();

      await t.throwsAsync(fn(logger), {
        instanceOf: startProxyExports.StartProxyError,
      });
    });
  },
  title: (providedTitle) => `${providedTitle} - wraps errors on failure`,
});

test("downloadProxy - returns file path on success", async (t) => {
  await withRecordingLoggerAsync(async (logger) => {
    const testPath = "/some/path";
    sinon.stub(toolcache, "downloadTool").resolves(testPath);

    const result = await startProxyExports.downloadProxy(
      logger,
      "url",
      undefined,
    );
    t.is(result, testPath);
  });
});

test(
  "downloadProxy",
  wrapFailureTest,
  () => {
    sinon.stub(toolcache, "downloadTool").throws();
  },
  async (logger) => {
    await startProxyExports.downloadProxy(logger, "url", undefined);
  },
);

test("extractProxy - returns file path on success", async (t) => {
  await withRecordingLoggerAsync(async (logger) => {
    const testPath = "/some/path";
    sinon.stub(toolcache, "extractTar").resolves(testPath);

    const result = await startProxyExports.extractProxy(logger, "/other/path");
    t.is(result, testPath);
  });
});

test(
  "extractProxy",
  wrapFailureTest,
  () => {
    sinon.stub(toolcache, "extractTar").throws();
  },
  async (logger) => {
    await startProxyExports.extractProxy(logger, "path");
  },
);

test("cacheProxy - returns file path on success", async (t) => {
  await withRecordingLoggerAsync(async (logger) => {
    const testPath = "/some/path";
    sinon.stub(toolcache, "cacheDir").resolves(testPath);

    const result = await startProxyExports.cacheProxy(
      logger,
      "/other/path",
      "proxy",
      "1.0",
    );
    t.is(result, testPath);
  });
});

test(
  "cacheProxy",
  wrapFailureTest,
  () => {
    sinon.stub(toolcache, "cacheDir").throws();
  },
  async (logger) => {
    await startProxyExports.cacheProxy(logger, "/other/path", "proxy", "1.0");
  },
);

test("getProxyBinaryPath - returns path from tool cache if available", async (t) => {
  mockGetReleaseByTag();

  await withRecordingLoggerAsync(async (logger) => {
    const toolcachePath = "/path/to/proxy/dir";
    sinon.stub(toolcache, "find").returns(toolcachePath);

    const path = await startProxyExports.getProxyBinaryPath(logger);

    t.assert(path);
    t.is(
      path,
      filepath.join(toolcachePath, startProxyExports.getProxyFilename()),
    );
  });
});

test("getProxyBinaryPath - downloads proxy if not in cache", async (t) => {
  const downloadUrl = "url-we-want";
  mockGetReleaseByTag([
    { name: startProxyExports.getProxyPackage(), url: downloadUrl },
  ]);

  await withRecordingLoggerAsync(async (logger) => {
    const toolcachePath = "/path/to/proxy/dir";
    const find = sinon.stub(toolcache, "find").returns("");
    const getApiDetails = sinon.stub(apiClient, "getApiDetails").returns({
      auth: "",
      url: "",
      apiURL: "",
    });
    const getAuthorizationHeaderFor = sinon
      .stub(apiClient, "getAuthorizationHeaderFor")
      .returns(undefined);
    const archivePath = "/path/to/archive";
    const downloadTool = sinon
      .stub(toolcache, "downloadTool")
      .resolves(archivePath);
    const extractedPath = "/path/to/extracted";
    const extractTar = sinon
      .stub(toolcache, "extractTar")
      .resolves(extractedPath);
    const cacheDir = sinon.stub(toolcache, "cacheDir").resolves(toolcachePath);

    const path = await startProxyExports.getProxyBinaryPath(logger);

    t.assert(find.calledOnce);
    t.assert(getApiDetails.calledOnce);
    t.assert(getAuthorizationHeaderFor.calledOnce);
    t.assert(downloadTool.calledOnceWith(downloadUrl));
    t.assert(extractTar.calledOnceWith(archivePath));
    t.assert(cacheDir.calledOnceWith(extractedPath));

    t.assert(path);
    t.is(
      path,
      filepath.join(toolcachePath, startProxyExports.getProxyFilename()),
    );
  });
});
