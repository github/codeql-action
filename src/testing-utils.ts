import { TextDecoder } from "node:util";
import path from "path";

import * as github from "@actions/github";
import { TestFn } from "ava";
import nock from "nock";
import * as sinon from "sinon";

import * as apiClient from "./api-client";
import { GitHubApiDetails } from "./api-client";
import * as codeql from "./codeql";
import { Config } from "./config-utils";
import * as defaults from "./defaults.json";
import {
  CodeQLDefaultVersionInfo,
  Feature,
  FeatureEnablement,
} from "./feature-flags";
import { Logger } from "./logging";
import {
  DEFAULT_DEBUG_ARTIFACT_NAME,
  DEFAULT_DEBUG_DATABASE_NAME,
  GitHubVariant,
  GitHubVersion,
  HTTPError,
} from "./util";

export const SAMPLE_DOTCOM_API_DETAILS = {
  auth: "token",
  url: "https://github.com",
  apiURL: "https://api.github.com",
};

export const SAMPLE_DEFAULT_CLI_VERSION: CodeQLDefaultVersionInfo = {
  cliVersion: "2.20.0",
  tagName: "codeql-bundle-v2.20.0",
};

export const LINKED_CLI_VERSION = {
  cliVersion: defaults.cliVersion,
  tagName: defaults.bundleVersion,
};

type TestContext = {
  stdoutWrite: any;
  stderrWrite: any;
  testOutput: string;
  env: NodeJS.ProcessEnv;
};

function wrapOutput(context: TestContext) {
  // Function signature taken from Socket.write.
  // Note there are two overloads:
  // write(buffer: Uint8Array | string, cb?: (err?: Error) => void): boolean;
  // write(str: Uint8Array | string, encoding?: string, cb?: (err?: Error) => void): boolean;
  return (
    chunk: Uint8Array | string,
    encoding?: string,
    cb?: (err?: Error) => void,
  ): boolean => {
    // Work out which method overload we are in
    if (cb === undefined && typeof encoding === "function") {
      cb = encoding;
      encoding = undefined;
    }

    // Record the output
    if (typeof chunk === "string") {
      context.testOutput += chunk;
    } else {
      context.testOutput += new TextDecoder(encoding || "utf-8").decode(chunk);
    }

    // Satisfy contract by calling callback when done
    if (cb !== undefined && typeof cb === "function") {
      cb();
    }

    return true;
  };
}

export function setupTests(test: TestFn<any>) {
  const typedTest = test as TestFn<TestContext>;

  typedTest.beforeEach((t) => {
    // Set an empty CodeQL object so that all method calls will fail
    // unless the test explicitly sets one up.
    codeql.setCodeQL({});

    // Replace stdout and stderr so we can record output during tests
    t.context.testOutput = "";
    const processStdoutWrite = process.stdout.write.bind(process.stdout);
    t.context.stdoutWrite = processStdoutWrite;
    process.stdout.write = wrapOutput(t.context) as any;
    const processStderrWrite = process.stderr.write.bind(process.stderr);
    t.context.stderrWrite = processStderrWrite;
    process.stderr.write = wrapOutput(t.context) as any;

    // Workaround an issue in tests where the case insensitivity of the `$PATH`
    // environment variable on Windows isn't preserved, i.e. `process.env.PATH`
    // is not the same as `process.env.Path`.
    const pathKeys = Object.keys(process.env).filter(
      (k) => k.toLowerCase() === "path",
    );
    if (pathKeys.length > 0) {
      process.env.PATH = process.env[pathKeys[0]];
    }

    // Many tests modify environment variables. Take a copy now so that
    // we reset them after the test to keep tests independent of each other.
    // process.env only has strings fields, so a shallow copy is fine.
    t.context.env = {};
    Object.assign(t.context.env, process.env);
  });

  typedTest.afterEach.always((t) => {
    // Restore stdout and stderr
    // The captured output is only replayed if the test failed
    process.stdout.write = t.context.stdoutWrite;
    process.stderr.write = t.context.stderrWrite;
    if (!t.passed) {
      process.stdout.write(t.context.testOutput);
    }

    // Undo any modifications made by nock
    nock.cleanAll();

    // Undo any modifications made by sinon
    sinon.restore();

    // Undo any modifications to the env
    process.env = t.context.env;
  });
}

// Sets environment variables that make using some libraries designed for
// use only on actions safe to use outside of actions.
export function setupActionsVars(tempDir: string, toolsDir: string) {
  process.env["RUNNER_TEMP"] = tempDir;
  process.env["RUNNER_TOOL_CACHE"] = toolsDir;
  process.env["GITHUB_WORKSPACE"] = tempDir;
}

export interface LoggedMessage {
  type: "debug" | "info" | "warning" | "error";
  message: string | Error;
}

export function getRecordingLogger(messages: LoggedMessage[]): Logger {
  return {
    debug: (message: string) => {
      messages.push({ type: "debug", message });
      console.debug(message);
    },
    info: (message: string) => {
      messages.push({ type: "info", message });
      console.info(message);
    },
    warning: (message: string | Error) => {
      messages.push({ type: "warning", message });
      console.warn(message);
    },
    error: (message: string | Error) => {
      messages.push({ type: "error", message });
      console.error(message);
    },
    isDebug: () => true,
    startGroup: () => undefined,
    endGroup: () => undefined,
  };
}

/** Mock the HTTP request to the feature flags enablement API endpoint. */
export function mockFeatureFlagApiEndpoint(
  responseStatusCode: number,
  response: { [flagName: string]: boolean },
) {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");

  const requestSpy = sinon.stub(client, "request");

  const optInSpy = requestSpy.withArgs(
    "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
  );
  if (responseStatusCode < 300) {
    optInSpy.resolves({
      status: responseStatusCode,
      data: response,
      headers: {},
      url: "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
    });
  } else {
    optInSpy.throws(new HTTPError("some error message", responseStatusCode));
  }

  sinon.stub(apiClient, "getApiClient").value(() => client);
}

export function mockLanguagesInRepo(languages: string[]) {
  const mockClient = sinon.stub(apiClient, "getApiClient");
  const listLanguages = sinon.stub().resolves({
    status: 200,
    data: languages.reduce((acc, lang) => {
      acc[lang] = 1;
      return acc;
    }, {}),
    headers: {},
    url: "GET /repos/:owner/:repo/languages",
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  mockClient.returns({
    rest: {
      repos: {
        listLanguages,
      },
    },
  } as any);
  return listLanguages;
}

/**
 * Constructs a `VersionInfo` object for testing purposes only.
 */
export const makeVersionInfo = (
  version: string,
  features?: { [name: string]: boolean },
): codeql.VersionInfo => ({
  version,
  features,
});

export function mockCodeQLVersion(
  version: string,
  features?: { [name: string]: boolean },
) {
  return codeql.setCodeQL({
    async getVersion() {
      return makeVersionInfo(version, features);
    },
  });
}

/**
 * Create a feature enablement instance with the specified set of enabled features.
 *
 * This should be only used within tests.
 */
export function createFeatures(enabledFeatures: Feature[]): FeatureEnablement {
  return {
    getDefaultCliVersion: async () => {
      throw new Error("not implemented");
    },
    getValue: async (feature) => {
      return enabledFeatures.includes(feature);
    },
  };
}

/**
 * Mocks the API for downloading the bundle tagged `tagName`.
 *
 * @returns the download URL for the bundle. This can be passed to the tools parameter of
 * `codeql.setupCodeQL`.
 */
export function mockBundleDownloadApi({
  apiDetails = SAMPLE_DOTCOM_API_DETAILS,
  isPinned,
  repo = "github/codeql-action",
  platformSpecific = true,
  tagName,
}: {
  apiDetails?: GitHubApiDetails;
  isPinned?: boolean;
  repo?: string;
  platformSpecific?: boolean;
  tagName: string;
}): string {
  const platform =
    process.platform === "win32"
      ? "win64"
      : process.platform === "linux"
      ? "linux64"
      : "osx64";

  const baseUrl = apiDetails?.url ?? "https://example.com";
  const relativeUrl = apiDetails
    ? `/${repo}/releases/download/${tagName}/codeql-bundle${
        platformSpecific ? `-${platform}` : ""
      }.tar.gz`
    : `/download/${tagName}/codeql-bundle.tar.gz`;

  nock(baseUrl)
    .get(relativeUrl)
    .replyWithFile(
      200,
      path.join(
        __dirname,
        `/../src/testdata/codeql-bundle${isPinned ? "-pinned" : ""}.tar.gz`,
      ),
    );

  return `${baseUrl}${relativeUrl}`;
}

export function createTestConfig(overrides: Partial<Config>): Config {
  return Object.assign(
    {},
    {
      languages: [],
      buildMode: undefined,
      originalUserInput: {},
      tempDir: "",
      codeQLCmd: "",
      gitHubVersion: {
        type: GitHubVariant.DOTCOM,
      } as GitHubVersion,
      dbLocation: "",
      debugMode: false,
      debugArtifactName: DEFAULT_DEBUG_ARTIFACT_NAME,
      debugDatabaseName: DEFAULT_DEBUG_DATABASE_NAME,
      augmentationProperties: {
        packsInputCombines: false,
        queriesInputCombines: false,
      },
      trapCaches: {},
      trapCacheDownloadTime: 0,
    },
    overrides,
  );
}
