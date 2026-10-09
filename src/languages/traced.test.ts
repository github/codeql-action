import fs from "fs";

import test from "ava";
import * as sinon from "sinon";

import * as diagnostics from "../diagnostics";
import { ActionsEnvVars } from "../environment";
import { Feature } from "../feature-flags";
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
import { ConfigurationError, withTmpDir } from "../util";

import { checkRunnerSupportsTracedAnalysis } from "./traced";

import { BuiltInLanguage } from ".";

setupTests(test);

const nonDarwinPlatforms: NodeJS.Platform[] = ["linux", "win32"];
for (const nonDarwinPlatform of nonDarwinPlatforms) {
  test(`checkRunnerSupportsTracedAnalysis throws for Swift on ${nonDarwinPlatform}`, async (t) =>
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
        checkRunnerSupportsTracedAnalysis(
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

test("checkRunnerSupportsTracedAnalysis warns if version string is not a semver", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

    const codeql = await getCodeQLForTesting("codeql-for-testing", logger, env);
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    await checkRunnerSupportsTracedAnalysis(
      initAllState({
        logger,
        platform: "darwin",
        osRelease: "unexpected",
        env,
      }),
      createTestConfig({ languages: [BuiltInLanguage.go] }),
      codeql,
    );

    checkExpectedLogMessages(t, logger.messages, [
      "Unable to determine version of macOS, got: unexpected",
    ]);
  }));

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkRunnerSupportsTracedAnalysis logs and adds diagnostic if macOS version is unsupported",
  async (t) =>
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

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({ languages: [BuiltInLanguage.swift] });
      await checkRunnerSupportsTracedAnalysis(
        initAllState({
          logger,
          platform: "darwin",
          osRelease: "27.0.0",
          env,
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
            macOSVersion: "27.0.0",
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

      const features = createFeatures([Feature.SkipUnsupportedTracedAnalysis]);

      const codeql = await getCodeQLForTesting(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({ languages: [BuiltInLanguage.swift] });
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
            macOSVersion: "27.0.0",
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

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkRunnerSupportsTracedAnalysis doesn't add a diagnostic if Xcode version is supported",
  async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

      const statSync = sinon
        .stub(fs, "statSync")
        .returns({ isSymbolicLink: () => true } as fs.Stats);
      const readlinkSync = sinon
        .stub(fs, "readlinkSync")
        .returns("/Applications/Xcode_26.0.app/Contents/Developer");

      const codeql = await getCodeQLForTesting(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({ languages: [BuiltInLanguage.swift] });
      await checkRunnerSupportsTracedAnalysis(
        initAllState({
          logger,
          platform: "darwin",
          osRelease: "26.0.0",
          env,
        }),
        config,
        codeql,
      );

      t.is(statSync.callCount, 1);
      t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);
      t.is(readlinkSync.callCount, 1);
      t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

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

      const statSync = sinon
        .stub(fs, "statSync")
        .returns({ isSymbolicLink: () => true } as fs.Stats);
      const readlinkSync = sinon
        .stub(fs, "readlinkSync")
        .returns("/Applications/Xcode_27.0.app/Contents/Developer");

      const codeql = await getCodeQLForTesting(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({ languages: [BuiltInLanguage.swift] });
      await checkRunnerSupportsTracedAnalysis(
        initAllState({
          logger,
          platform: "darwin",
          osRelease: "26.0.0",
          env,
        }),
        config,
        codeql,
      );

      t.is(statSync.callCount, 1);
      t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);
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

      const statSync = sinon
        .stub(fs, "statSync")
        .returns({ isSymbolicLink: () => true } as fs.Stats);
      const readlinkSync = sinon
        .stub(fs, "readlinkSync")
        .returns("/Applications/Xcode_27.0.app/Contents/Developer");

      const features = createFeatures([Feature.SkipUnsupportedTracedAnalysis]);

      const codeql = await getCodeQLForTesting(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({ languages: [BuiltInLanguage.swift] });
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

      t.is(statSync.callCount, 1);
      t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);
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
