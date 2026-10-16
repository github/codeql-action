import test from "ava";
import * as sinon from "sinon";

import { getCodeQLForTesting } from "../codeql";
import { ActionsEnvVars } from "../environment";
import {
  createTestConfig,
  getTestEnv,
  makeVersionInfo,
  RecordingLogger,
  setupTests,
} from "../testing-utils";
import { ToolsFeature } from "../tools-features";
import { withTmpDir } from "../util";

import { isSwiftCompatible } from "./swift";

import { BuiltInLanguage } from ".";

setupTests(test);

test("isSwiftCompatible doesn't throw for non-Swift languages", async (t) => {
  for (const language of Object.values(BuiltInLanguage)) {
    if (language === BuiltInLanguage.swift) {
      continue;
    }

    const codeql = await getCodeQLForTesting();
    await t.notThrowsAsync(
      isSwiftCompatible(
        createTestConfig({ languages: [language] }),
        codeql,
        // A value of `undefined` should make `isSwiftCompatible` throw for Swift by default
        // since it means we are on a platform other than macOS
        undefined,
      ),
    );
  }
});

test("isSwiftCompatible doesn't throw for Swift if CLI supports swiftSupportsAllPlatforms", async (t) =>
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
      isSwiftCompatible(
        createTestConfig({ languages: [BuiltInLanguage.swift] }),
        codeql,
        // A value of `undefined` should make `isSwiftCompatible` throw for Swift by default
        // since it means we are on a platform other than macOS
        undefined,
      ),
    );

    t.is(supportsFeature.callCount, 1);
    t.deepEqual(supportsFeature.args[0], [
      ToolsFeature.SwiftSupportsAllPlatforms,
    ]);
  }));

test("isSwiftCompatible doesn't throw for Swift on darwin", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

    const codeql = await getCodeQLForTesting("codeql-for-testing", logger, env);
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await t.notThrowsAsync(
      isSwiftCompatible(
        createTestConfig({
          tempDir: tmpDir,
          languages: [BuiltInLanguage.swift],
        }),
        codeql,
        // A value other than `undefined` means we are on macOS.
        "some-macos-version",
      ),
    );
  }));
