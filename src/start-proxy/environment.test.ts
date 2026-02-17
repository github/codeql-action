import test, { ExecutionContext } from "ava";

import { JavaEnvVars, KnownLanguage } from "../languages";
import {
  checkExpectedLogMessages,
  getRecordingLogger,
  LoggedMessage,
  setupTests,
} from "../testing-utils";

import {
  checkJavaEnvVars,
  checkProxyEnvironment,
  checkProxyEnvVars,
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
