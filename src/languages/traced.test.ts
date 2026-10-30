import fs from "fs";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";
import test from "ava";
import * as sinon from "sinon";

import { type CodeQL } from "../codeql";
import * as diagnostics from "../diagnostics";
import { ActionsEnvVars, type Env } from "../environment";
import { Feature } from "../feature-flags";
import type { Logger } from "../logging";
import { XCODE_SELECT_LINK_PATH } from "../platform";
import {
  checkExpectedLogMessages,
  checkUnexpectedLogMessages,
  createFeatures,
  createTestConfig,
  getCodeQLForTesting,
  getTestEnv,
  initAllState,
  makeVersionInfo,
  RecordingLogger,
  setupTests,
} from "../testing-utils";
import { BuildMode, ConfigurationError, withTmpDir } from "../util";

import { checkRunnerSupportsTracedAnalysis } from "./traced";

import { BuiltInLanguage } from ".";

setupTests(test);

const TEST_DEFAULT_TRACED_LANGUAGES = {
  [BuiltInLanguage.swift]: true,
  [BuiltInLanguage.go]: true,
};

async function getCodeQLWithTracedStub(
  cmd: string,
  logger: Logger,
  env: Env,
  tracedLanguages: Partial<
    Record<BuiltInLanguage, boolean>
  > = TEST_DEFAULT_TRACED_LANGUAGES,
): Promise<CodeQL> {
  const codeql = await getCodeQLForTesting(cmd, logger, env);
  sinon.stub(codeql, "isTracedLanguage").callsFake(async (language) => {
    return tracedLanguages[language] === true;
  });
  return codeql;
}

const nonDarwinPlatforms: NodeJS.Platform[] = ["linux", "win32"];
for (const nonDarwinPlatform of nonDarwinPlatforms) {
  test(`checkRunnerSupportsTracedAnalysis throws for Swift on ${nonDarwinPlatform}`, async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

      const codeql = await getCodeQLWithTracedStub(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      await t.throwsAsync(
        checkRunnerSupportsTracedAnalysis(
          initAllState({ platform: nonDarwinPlatform, env, logger }),
          createTestConfig({
            tempDir: tmpDir,
            languages: [BuiltInLanguage.swift],
          }),
          codeql,
        ),
        {
          instanceOf: ConfigurationError,
          message: /^Swift analysis is only supported on macOS runner images/,
        },
      );
    }));
}

test(`checkRunnerSupportsTracedAnalysis doesn't throw for BMN`, async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);
    const features = createFeatures([Feature.CheckUnsupportedTracedAnalysis]);

    const codeql = await getCodeQLWithTracedStub(
      "codeql-for-testing",
      logger,
      env,
    );
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await t.notThrowsAsync(
      checkRunnerSupportsTracedAnalysis(
        initAllState({
          platform: "darwin",
          osRelease: "27.0.0",
          env,
          logger,
          features,
        }),
        createTestConfig({ tempDir: tmpDir, buildMode: BuildMode.None }),
        codeql,
      ),
    );

    checkExpectedLogMessages(t, logger.messages, [
      "Skipping traced analysis compatibility checks because the build mode is 'none'.",
    ]);
  }));

// Some languages not in `TEST_DEFAULT_TRACED_LANGUAGES`.
const nonTracedLanguages: BuiltInLanguage[] = [
  BuiltInLanguage.javascript,
  BuiltInLanguage.actions,
];
for (const nonTracedLanguage of nonTracedLanguages) {
  test(`checkRunnerSupportsTracedAnalysis doesn't throw for ${nonTracedLanguage} on unsupported macOS`, async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);
      const features = createFeatures([Feature.CheckUnsupportedTracedAnalysis]);

      const codeql = await getCodeQLWithTracedStub(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      await t.notThrowsAsync(
        checkRunnerSupportsTracedAnalysis(
          initAllState({
            platform: "darwin",
            osRelease: "27.0.0",
            env,
            logger,
            features,
          }),
          createTestConfig({ tempDir: tmpDir, languages: [nonTracedLanguage] }),
          codeql,
        ),
      );

      checkExpectedLogMessages(t, logger.messages, [
        "Skipping traced analysis compatibility checks because no traced languages are being analyzed.",
      ]);
    }));
}

test("checkRunnerSupportsTracedAnalysis doesn't perform checks if FF is not enabled", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);
    const features = createFeatures([]);

    const codeql = await getCodeQLWithTracedStub(
      "codeql-for-testing",
      logger,
      env,
    );
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await checkRunnerSupportsTracedAnalysis(
      initAllState({
        logger,
        platform: "darwin",
        osRelease: "unexpected",
        env,
        features,
      }),
      createTestConfig({ tempDir: tmpDir, languages: [BuiltInLanguage.go] }),
      codeql,
    );

    checkExpectedLogMessages(t, logger.messages, [
      "Skipping traced analysis compatibility checks because the feature is not enabled.",
    ]);
  }));

test("checkRunnerSupportsTracedAnalysis warns if version string is not a semver", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);
    const features = createFeatures([Feature.CheckUnsupportedTracedAnalysis]);

    const codeql = await getCodeQLWithTracedStub(
      "codeql-for-testing",
      logger,
      env,
    );
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await checkRunnerSupportsTracedAnalysis(
      initAllState({
        logger,
        platform: "darwin",
        osRelease: "unexpected",
        env,
        features,
      }),
      createTestConfig({ tempDir: tmpDir, languages: [BuiltInLanguage.go] }),
      codeql,
    );

    checkExpectedLogMessages(t, logger.messages, [
      "Unable to parse Darwin kernel version, got: unexpected",
    ]);
  }));

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkRunnerSupportsTracedAnalysis logs and adds diagnostic if macOS version is unsupported",
  async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const features = createFeatures([Feature.CheckUnsupportedTracedAnalysis]);
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

      const codeql = await getCodeQLWithTracedStub(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({
        tempDir: tmpDir,
        languages: [BuiltInLanguage.swift],
      });
      await checkRunnerSupportsTracedAnalysis(
        initAllState({
          logger,
          platform: "darwin",
          osRelease: "27.0.0",
          env,
          features,
        }),
        config,
        codeql,
      );

      checkExpectedLogMessages(t, logger.messages, [
        "Traced analysis is not supported on macOS 27",
      ]);

      t.is(addDiagnostic.callCount, 1);
      t.like(addDiagnostic.args[0], [
        config,
        BuiltInLanguage.swift,
        {
          attributes: {
            languages: [BuiltInLanguage.swift],
            darwinVersion: "27.0.0",
          },
          severity: "warning",
          source: {
            id: "codeql-action/unsupported-traced-analysis-macos",
            name: "Traced analysis is not supported on this version of macOS",
          },
          visibility: {
            cliSummaryTable: true,
            statusPage: true,
            telemetry: true,
          },
        } satisfies Partial<diagnostics.DiagnosticMessage>,
      ]);
    }),
);

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkRunnerSupportsTracedAnalysis throws if macOS version is unsupported and FF is enabled",
  async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

      const features = createFeatures([
        Feature.CheckUnsupportedTracedAnalysis,
        Feature.AbortUnsupportedTracedAnalysis,
      ]);

      const codeql = await getCodeQLWithTracedStub(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({
        tempDir: tmpDir,
        languages: [BuiltInLanguage.swift],
      });
      await t.throwsAsync(
        checkRunnerSupportsTracedAnalysis(
          initAllState({
            logger,
            platform: "darwin",
            osRelease: "27.0.0",
            env,
            features,
          }),
          config,
          codeql,
        ),
      );

      t.is(addDiagnostic.callCount, 1);
      t.like(addDiagnostic.args[0], [
        config,
        BuiltInLanguage.swift,
        {
          attributes: {
            languages: [BuiltInLanguage.swift],
            darwinVersion: "27.0.0",
          },
          severity: "error",
          source: {
            id: "codeql-action/unsupported-traced-analysis-macos",
            name: "Traced analysis is not supported on this version of macOS",
          },
          visibility: {
            cliSummaryTable: true,
            statusPage: true,
            telemetry: true,
          },
        } satisfies Partial<diagnostics.DiagnosticMessage>,
      ]);
    }),
);

test("checkRunnerSupportsTracedAnalysis doesn't perform Xcode check on self-hosted runners", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);
    env.set(ActionsEnvVars.RUNNER_ENVIRONMENT, "self-hosted");
    const features = createFeatures([Feature.CheckUnsupportedTracedAnalysis]);

    const codeql = await getCodeQLWithTracedStub(
      "codeql-for-testing",
      logger,
      env,
    );
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await checkRunnerSupportsTracedAnalysis(
      initAllState({
        logger,
        platform: "darwin",
        osRelease: "26.0.0",
        env,
        features,
      }),
      createTestConfig({ tempDir: tmpDir, languages: [BuiltInLanguage.go] }),
      codeql,
    );

    checkExpectedLogMessages(t, logger.messages, [
      "Skipping traced analysis compatibility check for Xcode because we are on a self-hosted runner.",
    ]);
  }));

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkRunnerSupportsTracedAnalysis doesn't add a diagnostic if Xcode version is supported",
  async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);
      const features = createFeatures([Feature.CheckUnsupportedTracedAnalysis]);

      const readlinkSync = sinon
        .stub(fs, "readlinkSync")
        .returns("/Applications/Xcode_26.0.app/Contents/Developer");

      const codeql = await getCodeQLWithTracedStub(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({
        tempDir: tmpDir,
        languages: [BuiltInLanguage.swift],
      });
      await checkRunnerSupportsTracedAnalysis(
        initAllState({
          logger,
          platform: "darwin",
          osRelease: "26.0.0",
          env,
          features,
        }),
        config,
        codeql,
      );

      t.is(readlinkSync.callCount, 1);
      t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

      checkUnexpectedLogMessages(t, logger.messages, [
        "Traced analysis is not supported on Xcode 27",
      ]);

      t.is(addDiagnostic.callCount, 0);
    }),
);

test.serial(
  "checkRunnerSupportsTracedAnalysis attempts fallbacks if needed",
  async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);
      const features = createFeatures([Feature.CheckUnsupportedTracedAnalysis]);

      const readlinkSync = sinon
        .stub(fs, "readlinkSync")
        .throws(new Error("Not found"));
      const which = sinon.stub(io, "which").resolves("/path/to/xcrun");
      const exec = sinon.stub<[], Promise<number>>().callsFake(async () => {
        throw new Error("Error to force next fallback");
      });
      const runner = sinon.createStubInstance(toolrunner.ToolRunner, { exec });
      const toolrunnerStub = sinon
        .stub(toolrunner, "ToolRunner")
        .callsFake(() => {
          return runner;
        });

      const codeql = await getCodeQLWithTracedStub(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({
        tempDir: tmpDir,
        languages: [BuiltInLanguage.swift],
      });
      await checkRunnerSupportsTracedAnalysis(
        initAllState({
          logger,
          platform: "darwin",
          osRelease: "26.0.0",
          env,
          features,
        }),
        config,
        codeql,
      );

      t.is(readlinkSync.callCount, 1);
      t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);
      t.is(which.callCount, 2);
      t.deepEqual(which.args[0], ["xcrun", true]);
      t.deepEqual(which.args[1], ["xcrun", true]);

      t.is(toolrunnerStub.callCount, 2);
      t.is(exec.callCount, 2);

      t.is(toolrunnerStub.args[0][0], "/path/to/xcrun");
      t.deepEqual(toolrunnerStub.args[0][1], ["xcodebuild", "-version"]);

      t.is(toolrunnerStub.args[1][0], "/path/to/xcrun");
      t.deepEqual(toolrunnerStub.args[1][1], [
        "--sdk",
        "macosx",
        "--show-sdk-version",
      ]);

      checkExpectedLogMessages(t, logger.messages, [
        "Unable to determine Xcode version: Not found",
        "Unable to determine Xcode version from xcodebuild: Error to force next fallback",
        "Unable to determine Xcode version: Error to force next fallback",
      ]);
      checkUnexpectedLogMessages(t, logger.messages, [
        "Traced analysis is not supported on Xcode 27",
      ]);

      t.is(addDiagnostic.callCount, 0);
    }),
);

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkRunnerSupportsTracedAnalysis logs and adds diagnostic if Xcode version is unsupported",
  async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);
      const features = createFeatures([Feature.CheckUnsupportedTracedAnalysis]);

      const readlinkSync = sinon
        .stub(fs, "readlinkSync")
        .returns("/Applications/Xcode_27.0.app/Contents/Developer");

      const codeql = await getCodeQLWithTracedStub(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({
        tempDir: tmpDir,
        languages: [BuiltInLanguage.swift],
      });
      await checkRunnerSupportsTracedAnalysis(
        initAllState({
          logger,
          platform: "darwin",
          osRelease: "26.0.0",
          env,
          features,
        }),
        config,
        codeql,
      );

      t.is(readlinkSync.callCount, 1);
      t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

      checkExpectedLogMessages(t, logger.messages, [
        "Traced analysis is not supported on Xcode 27",
      ]);

      t.is(addDiagnostic.callCount, 1);
      t.like(addDiagnostic.args[0], [
        config,
        BuiltInLanguage.swift,
        {
          attributes: {
            languages: [BuiltInLanguage.swift],
            xcodeVersion: "27.0.0",
          },
          severity: "warning",
          source: {
            id: "codeql-action/unsupported-traced-analysis-xcode",
            name: "Traced analysis is not supported on this version of Xcode",
          },
          visibility: {
            cliSummaryTable: true,
            statusPage: true,
            telemetry: true,
          },
        } satisfies Partial<diagnostics.DiagnosticMessage>,
      ]);
    }),
);

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkRunnerSupportsTracedAnalysis throws if Xcode version is unsupported and FF is enabled",
  async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

      const readlinkSync = sinon
        .stub(fs, "readlinkSync")
        .returns("/Applications/Xcode_27.0.app/Contents/Developer");

      const features = createFeatures([
        Feature.CheckUnsupportedTracedAnalysis,
        Feature.AbortUnsupportedTracedAnalysis,
      ]);

      const codeql = await getCodeQLWithTracedStub(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({
        tempDir: tmpDir,
        languages: [BuiltInLanguage.swift],
      });
      await t.throwsAsync(
        checkRunnerSupportsTracedAnalysis(
          initAllState({
            logger,
            platform: "darwin",
            osRelease: "26.0.0",
            env,
            features,
          }),
          config,
          codeql,
        ),
      );

      t.is(readlinkSync.callCount, 1);
      t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

      t.is(addDiagnostic.callCount, 1);
      t.like(addDiagnostic.args[0], [
        config,
        BuiltInLanguage.swift,
        {
          attributes: {
            languages: [BuiltInLanguage.swift],
            xcodeVersion: "27.0.0",
          },
          severity: "error",
          source: {
            id: "codeql-action/unsupported-traced-analysis-xcode",
            name: "Traced analysis is not supported on this version of Xcode",
          },
          visibility: {
            cliSummaryTable: true,
            statusPage: true,
            telemetry: true,
          },
        } satisfies Partial<diagnostics.DiagnosticMessage>,
      ]);
    }),
);
