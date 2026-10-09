import fs from "fs";

import test from "ava";
import sinon from "sinon";

import * as diagnostics from "../diagnostics";
import { ActionsEnvVars } from "../environment";
import { Feature } from "../feature-flags";
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
import { ToolsFeature } from "../tools-features";
import { ConfigurationError, withTmpDir } from "../util";

import {
  checkSwiftCompatibility,
  XCODE_SELECT_LINK_PATH,
  xcodeVersion,
} from "./swift";

import { BuiltInLanguage } from ".";

setupTests(test);

test.serial("xcodeVersion returns undefined if symlink doesn't exist", (t) => {
  const logger = new RecordingLogger();

  const statSync = sinon.stub(fs, "statSync").throws(new Error("ENOENT"));

  t.is(xcodeVersion(logger), undefined);
  t.is(statSync.callCount, 1);
  t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);

  checkExpectedLogMessages(t, logger.messages, [
    "Unable to determine Xcode version: ENOENT",
  ]);
});

test.serial("xcodeVersion returns undefined if file is not a symlink", (t) => {
  const logger = new RecordingLogger();

  const statSync = sinon
    .stub(fs, "statSync")
    .returns({ isSymbolicLink: () => false } as fs.Stats);

  t.is(xcodeVersion(logger), undefined);
  t.is(statSync.callCount, 1);
  t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);

  checkExpectedLogMessages(t, logger.messages, [
    "exists, but is not a symbolic link",
  ]);
});

test.serial(
  "xcodeVersion returns undefined if resolving the symlink returns nothing",
  (t) => {
    const logger = new RecordingLogger();

    const statSync = sinon
      .stub(fs, "statSync")
      .returns({ isSymbolicLink: () => true } as fs.Stats);
    const readlinkSync = sinon.stub(fs, "readlinkSync").returns("");

    t.is(xcodeVersion(logger), undefined);
    t.is(statSync.callCount, 1);
    t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "unexpectedly returned nothing",
    ]);
  },
);

test.serial(
  "xcodeVersion returns undefined if resolved path doesn't include pattern",
  (t) => {
    const logger = new RecordingLogger();

    const statSync = sinon
      .stub(fs, "statSync")
      .returns({ isSymbolicLink: () => true } as fs.Stats);
    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .returns("/Applications/Xcode.app/Contents/Developer");

    t.is(xcodeVersion(logger), undefined);
    t.is(statSync.callCount, 1);
    t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "does not contain expected pattern",
    ]);
  },
);

test.serial("xcodeVersion returns undefined if match can't be parsed", (t) => {
  const logger = new RecordingLogger();

  const statSync = sinon
    .stub(fs, "statSync")
    .returns({ isSymbolicLink: () => true } as fs.Stats);
  const readlinkSync = sinon
    .stub(fs, "readlinkSync")
    .returns("/Applications/Xcode_00.0.app/Contents/Developer");

  t.is(xcodeVersion(logger), undefined);
  t.is(statSync.callCount, 1);
  t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);
  t.is(readlinkSync.callCount, 1);
  t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

  checkExpectedLogMessages(t, logger.messages, [
    "Couldn't parse '00.0' as a semantic version.",
  ]);
});

test.serial("xcodeVersion returns version from resolved path", (t) => {
  const logger = new RecordingLogger();

  const statSync = sinon
    .stub(fs, "statSync")
    .returns({ isSymbolicLink: () => true } as fs.Stats);
  const readlinkSync = sinon
    .stub(fs, "readlinkSync")
    .returns("/Applications/Xcode_16.4.app/Contents/Developer");

  const result = xcodeVersion(logger);

  if (t.truthy(result)) {
    t.is(result.major, 16);
    t.is(result.minor, 4);
  }

  t.is(statSync.callCount, 1);
  t.deepEqual(statSync.args[0], [XCODE_SELECT_LINK_PATH]);
  t.is(readlinkSync.callCount, 1);
  t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);
});

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

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkSwiftCompatibility logs and adds diagnostic if macOS version is unsupported",
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
      await checkSwiftCompatibility(
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
        "Traced Swift analysis is not supported on macOS 27",
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
            id: "codeql-action/unsupported-traced-swift-analysis-macos",
            name: "Traced Swift analysis is not supported on this version of macOS",
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
  "checkSwiftCompatibility throws if macOS version is unsupported and FF is enabled",
  async (t) =>
    withTmpDir(async (tmpDir) => {
      const logger = new RecordingLogger();
      const env = getTestEnv();
      env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

      const features = createFeatures([
        Feature.SwiftSkipUnsupportedTracedAnalysis,
      ]);

      const codeql = await getCodeQLForTesting(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({ languages: [BuiltInLanguage.swift] });
      await t.throwsAsync(
        checkSwiftCompatibility(
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
            id: "codeql-action/unsupported-traced-swift-analysis-macos",
            name: "Traced Swift analysis is not supported on this version of macOS",
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
  "checkSwiftCompatibility doesn't add a diagnostic if Xcode version is supported",
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
      await checkSwiftCompatibility(
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
        "Traced Swift analysis is not supported on Xcode 27",
      ]);

      t.is(addDiagnostic.callCount, 0);
    }),
);

// `addDiagnostic` changes global state and we must stub it, so this test must be serial.
test.serial(
  "checkSwiftCompatibility logs and adds diagnostic if Xcode version is unsupported",
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
      await checkSwiftCompatibility(
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
        "Traced Swift analysis is not supported on Xcode 27",
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
            id: "codeql-action/unsupported-traced-swift-analysis-xcode",
            name: "Traced Swift analysis is not supported on this version of Xcode",
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
  "checkSwiftCompatibility throws if Xcode version is unsupported and FF is enabled",
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

      const features = createFeatures([
        Feature.SwiftSkipUnsupportedTracedAnalysis,
      ]);

      const codeql = await getCodeQLForTesting(
        "codeql-for-testing",
        logger,
        env,
      );
      sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

      const addDiagnostic = sinon.stub(diagnostics, "addDiagnostic");

      const config = createTestConfig({ languages: [BuiltInLanguage.swift] });
      await t.throwsAsync(
        checkSwiftCompatibility(
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
            id: "codeql-action/unsupported-traced-swift-analysis-xcode",
            name: "Traced Swift analysis is not supported on this version of Xcode",
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
