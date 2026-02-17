import * as fs from "fs";
import * as os from "os";
import path from "path";

import test, { ExecutionContext } from "ava";

import { JavaEnvVars, KnownLanguage } from "../languages";
import {
  checkExpectedLogMessages,
  getRecordingLogger,
  LoggedMessage,
  setupTests,
} from "../testing-utils";
import { withTmpDir } from "../util";

import {
  checkJavaEnvVars,
  checkJdkSettings,
  checkProxyEnvironment,
  checkProxyEnvVars,
  discoverActionsJdks,
  JAVA_PROXY_ENV_VARS,
  ProxyEnvVars,
} from "./environment";

setupTests(test);

function assertEnvVarLogMessages(
  t: ExecutionContext<any>,
  envVars: string[],
  messages: LoggedMessage[],
  expectSet: boolean,
) {
  const template = (envVar: string) =>
    expectSet
      ? `Environment variable '${envVar}' is set to '${envVar}'`
      : `Environment variable '${envVar}' is not set`;

  const expected: string[] = [];

  for (const envVar of envVars) {
    expected.push(template(envVar));
  }

  checkExpectedLogMessages(t, messages, expected);
}

test("checkJavaEnvironment - none set", (t) => {
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  checkJavaEnvVars(logger);
  assertEnvVarLogMessages(t, JAVA_PROXY_ENV_VARS, messages, false);
});

test("checkJavaEnvironment - logs values when variables are set", (t) => {
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  for (const envVar of Object.values(JavaEnvVars)) {
    process.env[envVar] = envVar;
  }

  checkJavaEnvVars(logger);
  assertEnvVarLogMessages(t, JAVA_PROXY_ENV_VARS, messages, true);
});

test("discoverActionsJdks - discovers JDK paths", (t) => {
  // Clear GHA variables that may interfere with this test in CI.
  for (const envVar of Object.keys(process.env)) {
    if (envVar.startsWith("JAVA_HOME_")) {
      delete process[envVar];
    }
  }

  const jdk8 = "/usr/lib/jvm/temurin-8-jdk-amd64";
  const jdk17 = "/usr/lib/jvm/temurin-17-jdk-amd64";
  const jdk21 = "/usr/lib/jvm/temurin-21-jdk-amd64";

  process.env[JavaEnvVars.JAVA_HOME] = jdk17;
  process.env["JAVA_HOME_8_X64"] = jdk8;
  process.env["JAVA_HOME_17_X64"] = jdk17;
  process.env["JAVA_HOME_21_X64"] = jdk21;

  const results = discoverActionsJdks();
  t.is(results.size, 3);
  t.true(results.has(jdk8));
  t.true(results.has(jdk17));
  t.true(results.has(jdk21));
});

test("checkJdkSettings - does not throw for an empty directory", async (t) => {
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  await withTmpDir(async (tmpDir) => {
    t.notThrows(() => checkJdkSettings(logger, tmpDir));
  });
});

test("checkJdkSettings - finds files and logs relevant properties", async (t) => {
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  await withTmpDir(async (tmpDir) => {
    const dir = path.join(tmpDir, "conf");
    fs.mkdirSync(dir);

    const file = path.join(dir, "net.properties");
    fs.writeFileSync(
      file,
      [
        "irrelevant.property=foo",
        "http.proxyHost=proxy.example.com",
        "http.unrelated=bar",
      ].join(os.EOL),
      {},
    );
    checkJdkSettings(logger, tmpDir);

    checkExpectedLogMessages(t, messages, [
      `Found '${file}'.`,
      `Found 'http.proxyHost=proxy.example.com' in '${file}'`,
    ]);
  });
});

test("checkProxyEnvVars - none set", (t) => {
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  checkProxyEnvVars(logger);
  assertEnvVarLogMessages(t, Object.values(ProxyEnvVars), messages, false);
});

test("checkProxyEnvVars - logs values when variables are set", (t) => {
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  for (const envVar of Object.values(ProxyEnvVars)) {
    process.env[envVar] = envVar;
  }

  checkProxyEnvVars(logger);
  assertEnvVarLogMessages(t, Object.values(ProxyEnvVars), messages, true);
});

test("checkProxyEnvironment - includes base checks for all known languages", (t) => {
  for (const language of Object.values(KnownLanguage)) {
    const messages: LoggedMessage[] = [];
    const logger = getRecordingLogger(messages);

    checkProxyEnvironment(logger, language);
    assertEnvVarLogMessages(t, Object.keys(ProxyEnvVars), messages, false);
  }
});

test("checkProxyEnvironment - includes Java checks for Java", (t) => {
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  checkProxyEnvironment(logger, KnownLanguage.java);
  assertEnvVarLogMessages(t, Object.keys(ProxyEnvVars), messages, false);
  assertEnvVarLogMessages(t, JAVA_PROXY_ENV_VARS, messages, false);
});

test("checkProxyEnvironment - includes language-specific checks if the language is undefined", (t) => {
  const messages: LoggedMessage[] = [];
  const logger = getRecordingLogger(messages);

  checkProxyEnvironment(logger, undefined);
  assertEnvVarLogMessages(t, Object.keys(ProxyEnvVars), messages, false);
  assertEnvVarLogMessages(t, JAVA_PROXY_ENV_VARS, messages, false);
});
