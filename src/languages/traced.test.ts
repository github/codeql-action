import fs from "fs";

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
import { BuildMode, withTmpDir } from "../util";

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
          createTestConfig({ languages: [BuiltInLanguage.swift] }),
          codeql,
        ),
      );
    }));
}

test(`checkRunnerSupportsTracedAnalysis doesn't throw for BMN`, async (t) =>
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

    await t.notThrowsAsync(
      checkRunnerSupportsTracedAnalysis(
        initAllState({
          platform: "darwin",
          osRelease: "27.0.0",
          env,
          logger,
        }),
        createTestConfig({ buildMode: BuildMode.None }),
        codeql,
      ),
    );
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
          }),
          createTestConfig({ languages: [nonTracedLanguage] }),
          codeql,
        ),
      );
    }));
}

test("checkRunnerSupportsTracedAnalysis warns if version string is not a semver", async (t) =>
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

      const codeql = await getCodeQLWithTracedStub(
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

      const codeql = await getCodeQLWithTracedStub(
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

      const codeql = await getCodeQLWithTracedStub(
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

      const codeql = await getCodeQLWithTracedStub(
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

      const codeql = await getCodeQLWithTracedStub(
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
