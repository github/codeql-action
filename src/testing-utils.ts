import { TextDecoder } from "node:util";
import path from "path";

import * as github from "@actions/github";
import { ExecutionContext, TestFn } from "ava";
import nock from "nock";
import * as sinon from "sinon";

import { getActionVersion } from "./actions-util";
import { AnalysisKind } from "./analyses";
import * as apiClient from "./api-client";
import { GitHubApiDetails } from "./api-client";
import { CachingKind } from "./caching-utils";
import * as codeql from "./codeql";
import { Config } from "./config-utils";
import * as defaults from "./defaults.json";
import {
  CodeQLDefaultVersionInfo,
  Feature,
  featureConfig,
  FeatureEnablement,
} from "./feature-flags";
import { Logger } from "./logging";
import { OverlayDatabaseMode } from "./overlay";
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
  process.env["GITHUB_EVENT_NAME"] = "push";
}

type LogLevel = "debug" | "info" | "warning" | "error";

export interface LoggedMessage {
  type: LogLevel;
  message: string | Error;
}

export class RecordingLogger implements Logger {
  messages: LoggedMessage[] = [];
  groups: string[] = [];
  unfinishedGroups: Set<string> = new Set();
  private currentGroup: string | undefined = undefined;

  constructor(private readonly logToConsole: boolean = true) {}

  private addMessage(level: LogLevel, message: string | Error): void {
    this.messages.push({ type: level, message });

    if (this.logToConsole) {
      // eslint-disable-next-line no-console
      console.debug(message);
    }
  }

  isDebug() {
    return true;
  }

  debug(message: string) {
    this.addMessage("debug", message);
  }

  info(message: string) {
    this.addMessage("info", message);
  }

  warning(message: string | Error) {
    this.addMessage("warning", message);
  }

  error(message: string | Error) {
    this.addMessage("error", message);
  }

  startGroup(name: string) {
    this.groups.push(name);
    this.currentGroup = name;
    this.unfinishedGroups.add(name);
  }

  endGroup() {
    if (this.currentGroup !== undefined) {
      this.unfinishedGroups.delete(this.currentGroup);
    }
    this.currentGroup = undefined;
  }
}

export function getRecordingLogger(
  messages: LoggedMessage[],
  { logToConsole }: { logToConsole?: boolean } = { logToConsole: true },
): Logger {
  const logger = new RecordingLogger(logToConsole);
  logger.messages = messages;
  return logger;
}

/**
 * Checks whether `messages` contains `messageOrRegExp`.
 *
 * If `messageOrRegExp` is a string, this function returns true as long as
 * `messageOrRegExp` appears as part of one of the `messages`.
 *
 * If `messageOrRegExp` is a regular expression, this function returns true as long as
 * one of the `messages` matches `messageOrRegExp`.
 */
function hasLoggedMessage(
  messages: LoggedMessage[],
  messageOrRegExp: string | RegExp,
): boolean {
  const check = (val: string) =>
    typeof messageOrRegExp === "string"
      ? val.includes(messageOrRegExp)
      : messageOrRegExp.test(val);

  return messages.some(
    (msg) => typeof msg.message === "string" && check(msg.message),
  );
}

/**
 * Checks that `messages` contains all of `expectedMessages`.
 */
export function checkExpectedLogMessages(
  t: ExecutionContext<any>,
  messages: LoggedMessage[],
  expectedMessages: string[],
) {
  const missingMessages: string[] = [];

  for (const expectedMessage of expectedMessages) {
    if (!hasLoggedMessage(messages, expectedMessage)) {
      missingMessages.push(expectedMessage);
    }
  }

  if (missingMessages.length > 0) {
    const listify = (lines: string[]) =>
      lines.map((m) => ` - '${m}'`).join("\n");

    t.fail(
      `Expected\n\n${listify(missingMessages)}\n\nin the logger output, but didn't find it in:\n\n${messages.map((m) => ` - '${m.message}'`).join("\n")}`,
    );
  } else {
    t.pass();
  }
}

/**
 * Asserts that `message` should not have been logged to `logger`.
 */
export function assertNotLogged(
  t: ExecutionContext<any>,
  logger: RecordingLogger,
  message: string | RegExp,
) {
  t.false(
    hasLoggedMessage(logger.messages, message),
    `'${message}' should not have been logged, but was.`,
  );
}

/**
 * Initialises a recording logger and calls `body` with it.
 *
 * @param body The test that requires a recording logger.
 * @returns The logged messages.
 */
export async function withRecordingLoggerAsync(
  body: (logger: Logger) => Promise<void>,
): Promise<LoggedMessage[]> {
  const messages = [];
  const logger = getRecordingLogger(messages);

  await body(logger);

  return messages;
}

/** Mock the HTTP request to the feature flags enablement API endpoint. */
export function mockFeatureFlagApiEndpoint(
  responseStatusCode: number,
  response: { [flagName: string]: boolean },
) {
  stubFeatureFlagApiEndpoint(() => ({
    status: responseStatusCode,
    messageIfError: "some error message",
    data: response,
  }));
}

/** Stub the HTTP request to the feature flags enablement API endpoint. */
export function stubFeatureFlagApiEndpoint(
  responseFunction: (params: any) => {
    status: number;
    messageIfError?: string;
    data: { [flagName: string]: boolean };
  },
) {
  // Passing an auth token is required, so we just use a dummy value
  const client = github.getOctokit("123");

  const requestSpy = sinon.stub(client, "request");

  const optInSpy = requestSpy.withArgs(
    "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
  );

  optInSpy.callsFake((_route, params) => {
    const response = responseFunction(params);
    if (response.status < 300) {
      return Promise.resolve({
        status: response.status,
        data: response.data,
        headers: {},
        url: "GET /repos/:owner/:repo/code-scanning/codeql-action/features",
      });
    } else {
      throw new HTTPError(
        response.messageIfError || "default stub error message",
        response.status,
      );
    }
  });

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
  overlayVersion?: number,
): codeql.VersionInfo => ({
  version,
  features,
  overlayVersion,
});

export function mockCodeQLVersion(
  version: string,
  features?: { [name: string]: boolean },
  overlayVersion?: number,
) {
  return codeql.createStubCodeQL({
    async getVersion() {
      return makeVersionInfo(version, features, overlayVersion);
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
      return enabledFeatures.includes(feature as Feature);
    },
  };
}

export function initializeFeatures(initialValue: boolean) {
  return Object.keys(featureConfig).reduce((features, key) => {
    features[key] = initialValue;
    return features;
  }, {});
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

  const bundleUrls = ["tar.gz", "tar.zst"].map((extension) => {
    const relativeUrl = apiDetails
      ? `/${repo}/releases/download/${tagName}/codeql-bundle${
          platformSpecific ? `-${platform}` : ""
        }.${extension}`
      : `/download/${tagName}/codeql-bundle.${extension}`;

    nock(baseUrl)
      .get(relativeUrl)
      .replyWithFile(
        200,
        path.join(
          __dirname,
          `/../src/testdata/codeql-bundle${
            isPinned ? "-pinned" : ""
          }.${extension}`,
        ),
      );
    return `${baseUrl}${relativeUrl}`;
  });

  // Choose an arbitrary URL to return
  return bundleUrls[0];
}

export function createTestConfig(overrides: Partial<Config>): Config {
  return Object.assign(
    {},
    {
      version: getActionVersion(),
      analysisKinds: [AnalysisKind.CodeScanning],
      languages: [],
      buildMode: undefined,
      originalUserInput: {},
      computedConfig: {},
      tempDir: "",
      codeQLCmd: "",
      gitHubVersion: {
        type: GitHubVariant.DOTCOM,
      } as GitHubVersion,
      dbLocation: "",
      debugMode: false,
      debugArtifactName: DEFAULT_DEBUG_ARTIFACT_NAME,
      debugDatabaseName: DEFAULT_DEBUG_DATABASE_NAME,
      trapCaches: {},
      trapCacheDownloadTime: 0,
      dependencyCachingEnabled: CachingKind.None,
      dependencyCachingRestoredKeys: [],
      extraQueryExclusions: [],
      overlayDatabaseMode: OverlayDatabaseMode.None,
      useOverlayDatabaseCaching: false,
      repositoryProperties: {},
      enableFileCoverageInformation: true,
    } satisfies Config,
    overrides,
  );
}

export function makeTestToken(length: number = 36) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return chars.repeat(Math.ceil(length / chars.length)).slice(0, length);
}
