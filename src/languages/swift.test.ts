import test from "ava";
import sinon from "sinon";

import { ActionsEnvVars } from "../environment";
import {
  checkExpectedLogMessages,
  createTestConfig,
  getCodeQLForTesting,
  getTestEnv,
  initAllState,
  makeVersionInfo,
  RecordingLogger,
} from "../testing-utils";
import { ToolsFeature } from "../tools-features";
import { ConfigurationError, withTmpDir } from "../util";

import { checkSwiftCompatibility } from "./swift";

import { BuiltInLanguage } from ".";

test("checkSwiftCompatibility doesn't throw for non-Swift languages", async (t) => {
  for (const language of Object.values(BuiltInLanguage)) {
    if (language === BuiltInLanguage.swift) {
      continue;
    }

    const codeql = await getCodeQLForTesting();
    await t.notThrowsAsync(
      checkSwiftCompatibility(
        initAllState(),
        createTestConfig({ languages: [language] }),
        codeql,
      ),
    );
  }
});

test("checkSwiftCompatibility doesn't throw for Swift if CLI supports swiftSupportsAllPlatforms", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

    const codeql = await getCodeQLForTesting("codeql-for-testing", logger, env);
    const supportsFeature = sinon
      .stub(codeql, "supportsFeature")
      .withArgs(ToolsFeature.SwiftSupportsAllPlatforms)
      .resolves(true);

    await t.notThrowsAsync(
      checkSwiftCompatibility(
        initAllState({ platform: "darwin", env, logger }),
        createTestConfig({ languages: [BuiltInLanguage.swift] }),
        codeql,
      ),
    );

    t.is(supportsFeature.callCount, 1);
    t.deepEqual(supportsFeature.args[0], [
      ToolsFeature.SwiftSupportsAllPlatforms,
    ]);
  }));

test("checkSwiftCompatibility doesn't throw for Swift on darwin", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

    const codeql = await getCodeQLForTesting("codeql-for-testing", logger, env);
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await t.notThrowsAsync(
      checkSwiftCompatibility(
        initAllState({ platform: "darwin", env, logger }),
        createTestConfig({ languages: [BuiltInLanguage.swift] }),
        codeql,
      ),
    );
  }));

const nonDarwinPlatforms: NodeJS.Platform[] = ["linux", "win32"];
for (const nonDarwinPlatform of nonDarwinPlatforms) {
  test(`checkSwiftCompatibility throws for Swift on ${nonDarwinPlatform}`, async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

      const codeql = await getCodeQLForTesting(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      await t.throwsAsync(
        checkSwiftCompatibility(
          initAllState({ platform: nonDarwinPlatform, env, logger }),
          createTestConfig({ languages: [BuiltInLanguage.swift] }),
          codeql,
        ),
        {
          instanceOf: ConfigurationError,
          message: /^Swift analysis is only supported on macOS runner images/,
        },
      );
    }));
}

test("checkSwiftCompatibility warns if version string is not a semver", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

    const codeql = await getCodeQLForTesting("codeql-for-testing", logger, env);
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await checkSwiftCompatibility(
      initAllState({
        logger,
        platform: "darwin",
        osRelease: "unexpected",
        env,
      }),
      createTestConfig({ languages: [BuiltInLanguage.swift] }),
      codeql,
    );

    checkExpectedLogMessages(t, logger.messages, [
      "Unable to determine version of macOS, got: unexpected",
    ]);
  }));
