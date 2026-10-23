import test from "ava";
import sinon from "sinon";

import { ActionsEnvVars } from "../environment";
import {
  createTestConfig,
  getCodeQLForTesting,
  getTestEnv,
  makeVersionInfo,
  RecordingLogger,
  setupTests,
} from "../testing-utils";
import { ToolsFeature } from "../tools-features";
import { withTmpDir } from "../util";

import { checkSwiftCompatibility } from "./swift";

import { BuiltInLanguage } from ".";

setupTests(test);

test("checkSwiftCompatibility doesn't throw for non-Swift languages", async (t) => {
  for (const language of Object.values(BuiltInLanguage)) {
    if (language === BuiltInLanguage.swift) {
      continue;
    }

    const codeql = await getCodeQLForTesting();
    await t.notThrowsAsync(
      checkSwiftCompatibility(
        createTestConfig({ languages: [language] }),
        codeql,
        // A value of `undefined` should make `isSwiftCompatible` throw for Swift by default
        // since it means we are on a platform other than macOS
        undefined,
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

test("checkSwiftCompatibility doesn't throw for Swift on darwin", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

    const codeql = await getCodeQLForTesting("codeql-for-testing", logger, env);
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await t.notThrowsAsync(
      checkSwiftCompatibility(
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
