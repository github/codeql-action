import * as fs from "fs";
import path from "path";

import * as core from "@actions/core";
import * as github from "@actions/github";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { createStubCodeQL } from "./codeql";
import { Feature } from "./feature-flags";
import {
  checkPacksForOverlayCompatibility,
  cleanupDatabaseClusterDirectory,
  getFileCoverageInformationEnabled,
  logFileCoverageOnPrsDeprecationWarning,
} from "./init";
import { BuiltInLanguage } from "./languages";
import {
  createFeatures,
  LoggedMessage,
  createTestConfig,
  getRecordingLogger,
  setupTests,
  makeMacro,
} from "./testing-utils";
import { ConfigurationError, withTmpDir } from "./util";

setupTests(test);

test("cleanupDatabaseClusterDirectory cleans up where possible", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    const dbLocation = path.resolve(tmpDir, "dbs");
    fs.mkdirSync(dbLocation, { recursive: true });

    const fileToCleanUp = path.resolve(dbLocation, "something-to-cleanup.txt");
    fs.writeFileSync(fileToCleanUp, "");

    const messages: LoggedMessage[] = [];
    cleanupDatabaseClusterDirectory(
      createTestConfig({ dbLocation }),
      getRecordingLogger(messages),
    );

    t.is(messages.length, 2);
    t.is(messages[0].type, "warning");
    t.is(
      messages[0].message,
      `The database cluster directory ${dbLocation} must be empty. Attempting to clean it up.`,
    );
    t.is(messages[1].type, "info");
    t.is(
      messages[1].message,
      `Cleaned up database cluster directory ${dbLocation}.`,
    );

    t.false(fs.existsSync(fileToCleanUp));
  });
});

for (const { runnerEnv, ErrorConstructor, message } of [
  {
    runnerEnv: "self-hosted",
    ErrorConstructor: ConfigurationError,
    message: (dbLocation) =>
      "The CodeQL Action requires an empty database cluster directory. By default, this is located " +
      `at ${dbLocation}. You can customize it using the 'db-location' input to the init Action. An ` +
      "attempt was made to clean up the directory, but this failed. This can happen if another " +
      "process is using the directory or the directory is owned by a different user. Please clean " +
      "up the directory manually and rerun the job.",
  },
  {
    runnerEnv: "github-hosted",
    ErrorConstructor: Error,
    message: (dbLocation) =>
      "The CodeQL Action requires an empty database cluster directory. By default, this is located " +
      `at ${dbLocation}. You can customize it using the 'db-location' input to the init Action. An ` +
      "attempt was made to clean up the directory, but this failed. This shouldn't typically " +
      "happen on hosted runners. If you are using an advanced setup, please check your workflow, " +
      "otherwise we recommend rerunning the job.",
  },
]) {
  test.serial(
    `cleanupDatabaseClusterDirectory throws a ${ErrorConstructor.name} when cleanup fails on ${runnerEnv} runner`,
    async (t) => {
      await withTmpDir(async (tmpDir: string) => {
        process.env["RUNNER_ENVIRONMENT"] = runnerEnv;

        const dbLocation = path.resolve(tmpDir, "dbs");
        fs.mkdirSync(dbLocation, { recursive: true });

        const fileToCleanUp = path.resolve(
          dbLocation,
          "something-to-cleanup.txt",
        );
        fs.writeFileSync(fileToCleanUp, "");

        const rmSyncError = `Failed to clean up file ${fileToCleanUp}`;

        const messages: LoggedMessage[] = [];
        t.throws(
          () =>
            cleanupDatabaseClusterDirectory(
              createTestConfig({ dbLocation }),
              getRecordingLogger(messages),
              {},
              () => {
                throw new Error(rmSyncError);
              },
            ),
          {
            instanceOf: ErrorConstructor,
            message: `${message(dbLocation)} Details: ${rmSyncError}`,
          },
        );

        t.is(messages.length, 1);
        t.is(messages[0].type, "warning");
        t.is(
          messages[0].message,
          `The database cluster directory ${dbLocation} must be empty. Attempting to clean it up.`,
        );
      });
    },
  );
}

test("cleanupDatabaseClusterDirectory can disable warning with options", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    const dbLocation = path.resolve(tmpDir, "dbs");
    fs.mkdirSync(dbLocation, { recursive: true });

    const fileToCleanUp = path.resolve(dbLocation, "something-to-cleanup.txt");
    fs.writeFileSync(fileToCleanUp, "");

    const messages: LoggedMessage[] = [];
    cleanupDatabaseClusterDirectory(
      createTestConfig({ dbLocation }),
      getRecordingLogger(messages),
      { disableExistingDirectoryWarning: true },
    );

    // Should only have the info message, not the warning
    t.is(messages.length, 1);
    t.is(messages[0].type, "info");
    t.is(
      messages[0].message,
      `Cleaned up database cluster directory ${dbLocation}.`,
    );

    t.false(fs.existsSync(fileToCleanUp));
  });
});

type PackInfo = {
  language: BuiltInLanguage;
  packinfoContents: string | undefined;
  sourceOnlyPack?: boolean;
  qlpackFileName?: string;
};

const testCheckPacksForOverlayCompatibility = makeMacro({
  exec: async (
    t: ExecutionContext,
    {
      cliOverlayVersion,
      languages,
      packs,
      expectedResult,
    }: {
      cliOverlayVersion: number | undefined;
      languages: BuiltInLanguage[];
      packs: Record<string, PackInfo>;
      expectedResult: boolean;
    },
  ) => {
    await withTmpDir(async (tmpDir) => {
      const packDirsByLanguage = new Map<BuiltInLanguage, string[]>();

      for (const [packName, packInfo] of Object.entries(packs)) {
        const packPath = path.join(tmpDir, packName);
        fs.mkdirSync(packPath, { recursive: true });
        if (packInfo.packinfoContents) {
          fs.writeFileSync(
            path.join(packPath, ".packinfo"),
            packInfo.packinfoContents,
          );
        }
        const qlpackFileName = packInfo.qlpackFileName || "qlpack.yml";
        fs.writeFileSync(
          path.join(packPath, qlpackFileName),
          packInfo.sourceOnlyPack
            ? `name: ${packName}\nversion: 1.0.0\n`
            : `name: ${packName}\nversion: 1.0.0\nbuildMetadata:\n sha: 123abc\n`,
        );

        if (!packDirsByLanguage.has(packInfo.language)) {
          packDirsByLanguage.set(packInfo.language, []);
        }
        packDirsByLanguage.get(packInfo.language)!.push(packPath);
      }

      const codeql = createStubCodeQL({
        getVersion: async () => ({
          version: "2.22.2",
          overlayVersion: cliOverlayVersion,
        }),
        resolveQueriesStartingPacks: async (suitePaths: string[]) => {
          for (const language of packDirsByLanguage.keys()) {
            const suiteForLanguage = path.join(
              language,
              "temp",
              "config-queries.qls",
            );
            if (suitePaths[0].endsWith(suiteForLanguage)) {
              return packDirsByLanguage.get(language) || [];
            }
          }
          return [];
        },
      });

      const messages: LoggedMessage[] = [];
      const result = await checkPacksForOverlayCompatibility(
        codeql,
        createTestConfig({ dbLocation: tmpDir, languages }),
        getRecordingLogger(messages),
      );
      t.is(result, expectedResult);
      t.deepEqual(
        messages.length,
        expectedResult ? 0 : 1,
        "Expected log messages",
      );
    });
  },
  title: (title) => `checkPacksForOverlayCompatibility: ${title}`,
});

testCheckPacksForOverlayCompatibility(
  "returns false when CLI does not support overlay",
  {
    cliOverlayVersion: undefined,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: false,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns true when there are no query packs",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {},
    expectedResult: true,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns true when query pack has not been compiled",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: undefined,
        sourceOnlyPack: true,
      },
    },
    expectedResult: true,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns true when query pack has expected overlay version",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: true,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns true when query packs for all languages to analyze are compatible",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.cpp, BuiltInLanguage.java],
    packs: {
      "codeql/cpp-queries": {
        language: BuiltInLanguage.cpp,
        packinfoContents: '{"overlayVersion":2}',
      },
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: true,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns true when query pack for a language not analyzed is incompatible",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/cpp-queries": {
        language: BuiltInLanguage.cpp,
        packinfoContents: undefined,
      },
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: true,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns false when query pack for a language to analyze is incompatible",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.cpp, BuiltInLanguage.java],
    packs: {
      "codeql/cpp-queries": {
        language: BuiltInLanguage.cpp,
        packinfoContents: '{"overlayVersion":1}',
      },
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: false,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns false when query pack is missing .packinfo",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
      "custom/queries": {
        language: BuiltInLanguage.java,
        packinfoContents: undefined,
      },
    },
    expectedResult: false,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns false when query pack has different overlay version",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
      "custom/queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":1}',
      },
    },
    expectedResult: false,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns false when query pack is missing overlayVersion in .packinfo",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
      "custom/queries": {
        language: BuiltInLanguage.java,
        packinfoContents: "{}",
      },
    },
    expectedResult: false,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns false when .packinfo is not valid JSON",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
      "custom/queries": {
        language: BuiltInLanguage.java,
        packinfoContents: "this_is_not_valid_json",
      },
    },
    expectedResult: false,
  },
);

testCheckPacksForOverlayCompatibility(
  "returns true when query pack uses codeql-pack.yml filename",
  {
    cliOverlayVersion: 2,
    languages: [BuiltInLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: BuiltInLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
        qlpackFileName: "codeql-pack.yml",
      },
    },
    expectedResult: true,
  },
);

test("file coverage information enabled when debugMode is true", async (t) => {
  const result = await getFileCoverageInformationEnabled(
    true, // debugMode
    createStubCodeQL({}),
    createFeatures([Feature.SkipFileCoverageOnPrs]),
    {},
  );
  t.true(result.enabled);
  t.false(result.enabledByRepositoryProperty);
  t.false(result.showDeprecationWarning);
});

test.serial(
  "file coverage information enabled when not analyzing a pull request",
  async (t) => {
    sinon.stub(actionsUtil, "isAnalyzingPullRequest").returns(false);

    const result = await getFileCoverageInformationEnabled(
      false, // debugMode
      createStubCodeQL({}),
      createFeatures([Feature.SkipFileCoverageOnPrs]),
      {},
    );
    t.true(result.enabled);
    t.false(result.enabledByRepositoryProperty);
    t.false(result.showDeprecationWarning);
  },
);

test.serial(
  "file coverage information enabled when feature flag is not enabled, with deprecation warning",
  async (t) => {
    sinon.stub(actionsUtil, "isAnalyzingPullRequest").returns(true);

    const result = await getFileCoverageInformationEnabled(
      false, // debugMode
      createStubCodeQL({}),
      createFeatures([]),
      {},
    );
    t.true(result.enabled);
    t.false(result.enabledByRepositoryProperty);
    t.true(result.showDeprecationWarning);
  },
);

test.serial(
  "file coverage information enabled when repository property is set",
  async (t) => {
    sinon.stub(actionsUtil, "isAnalyzingPullRequest").returns(true);

    const result = await getFileCoverageInformationEnabled(
      false, // debugMode
      createStubCodeQL({}),
      createFeatures([Feature.SkipFileCoverageOnPrs]),
      {
        "github-codeql-file-coverage-on-prs": true,
      },
    );
    t.true(result.enabled);
    t.true(result.enabledByRepositoryProperty);
    t.false(result.showDeprecationWarning);
  },
);

test.serial(
  "file coverage information enabled when env var opt-out is set",
  async (t) => {
    sinon.stub(actionsUtil, "isAnalyzingPullRequest").returns(true);
    process.env["CODEQL_ACTION_FILE_COVERAGE_ON_PRS"] = "true";

    const result = await getFileCoverageInformationEnabled(
      false, // debugMode
      createStubCodeQL({}),
      createFeatures([Feature.SkipFileCoverageOnPrs]),
      {},
    );
    t.true(result.enabled);
    t.false(result.enabledByRepositoryProperty);
    t.false(result.showDeprecationWarning);
  },
);

test.serial(
  "file coverage information disabled when all conditions for skipping are met",
  async (t) => {
    sinon.stub(actionsUtil, "isAnalyzingPullRequest").returns(true);

    const result = await getFileCoverageInformationEnabled(
      false, // debugMode
      createStubCodeQL({}),
      createFeatures([Feature.SkipFileCoverageOnPrs]),
      {},
    );
    t.false(result.enabled);
    t.false(result.enabledByRepositoryProperty);
    t.false(result.showDeprecationWarning);
  },
);

test.serial(
  "file coverage deprecation warning for org-owned repo with default setup recommends repo property",
  (t) => {
    const exportVariableStub = sinon.stub(core, "exportVariable");
    sinon.stub(actionsUtil, "isDefaultSetup").returns(true);
    github.context.payload = {
      repository: {
        name: "test-repo",
        owner: { login: "test-org", type: "Organization" },
      },
    };
    const messages: LoggedMessage[] = [];
    logFileCoverageOnPrsDeprecationWarning(getRecordingLogger(messages));
    t.is(messages.length, 1);
    t.is(messages[0].type, "warning");
    t.is(
      messages[0].message,
      "Starting April 2026, the CodeQL Action will skip computing file coverage information on pull requests " +
        "to improve analysis performance. File coverage information will still be computed on non-PR analyses.\n\n" +
        "To opt out of this change, create a custom repository property " +
        'with the name `github-codeql-file-coverage-on-prs` and the type "True/false", then set this property to ' +
        "`true` in the repository's settings.",
    );
    t.true(exportVariableStub.calledOnce);
  },
);

test.serial(
  "file coverage deprecation warning for org-owned repo with advanced setup recommends env var and repo property",
  (t) => {
    const exportVariableStub = sinon.stub(core, "exportVariable");
    sinon.stub(actionsUtil, "isDefaultSetup").returns(false);
    github.context.payload = {
      repository: {
        name: "test-repo",
        owner: { login: "test-org", type: "Organization" },
      },
    };
    const messages: LoggedMessage[] = [];
    logFileCoverageOnPrsDeprecationWarning(getRecordingLogger(messages));
    t.is(messages.length, 1);
    t.is(messages[0].type, "warning");
    t.is(
      messages[0].message,
      "Starting April 2026, the CodeQL Action will skip computing file coverage information on pull requests " +
        "to improve analysis performance. File coverage information will still be computed on non-PR analyses.\n\n" +
        "To opt out of this change, set the `CODEQL_ACTION_FILE_COVERAGE_ON_PRS` environment variable to `true`. " +
        "Alternatively, create a custom repository property " +
        'with the name `github-codeql-file-coverage-on-prs` and the type "True/false", then set this property to ' +
        "`true` in the repository's settings.",
    );
    t.true(exportVariableStub.calledOnce);
  },
);

test.serial(
  "file coverage deprecation warning for user-owned repo with default setup recommends advanced setup",
  (t) => {
    const exportVariableStub = sinon.stub(core, "exportVariable");
    sinon.stub(actionsUtil, "isDefaultSetup").returns(true);
    github.context.payload = {
      repository: {
        name: "test-repo",
        owner: { login: "test-user", type: "User" },
      },
    };
    const messages: LoggedMessage[] = [];
    logFileCoverageOnPrsDeprecationWarning(getRecordingLogger(messages));
    t.is(messages.length, 1);
    t.is(messages[0].type, "warning");
    t.is(
      messages[0].message,
      "Starting April 2026, the CodeQL Action will skip computing file coverage information on pull requests " +
        "to improve analysis performance. File coverage information will still be computed on non-PR analyses.\n\n" +
        "To opt out of this change, switch to an advanced setup workflow and " +
        "set the `CODEQL_ACTION_FILE_COVERAGE_ON_PRS` environment variable to `true`.",
    );
    t.true(exportVariableStub.calledOnce);
  },
);

test.serial(
  "file coverage deprecation warning for user-owned repo with advanced setup recommends env var",
  (t) => {
    const exportVariableStub = sinon.stub(core, "exportVariable");
    sinon.stub(actionsUtil, "isDefaultSetup").returns(false);
    github.context.payload = {
      repository: {
        name: "test-repo",
        owner: { login: "test-user", type: "User" },
      },
    };
    const messages: LoggedMessage[] = [];
    logFileCoverageOnPrsDeprecationWarning(getRecordingLogger(messages));
    t.is(messages.length, 1);
    t.is(messages[0].type, "warning");
    t.is(
      messages[0].message,
      "Starting April 2026, the CodeQL Action will skip computing file coverage information on pull requests " +
        "to improve analysis performance. File coverage information will still be computed on non-PR analyses.\n\n" +
        "To opt out of this change, set the `CODEQL_ACTION_FILE_COVERAGE_ON_PRS` environment variable to `true`.",
    );
    t.true(exportVariableStub.calledOnce);
  },
);

test.serial(
  "file coverage deprecation warning for unknown owner type with default setup recommends advanced setup",
  (t) => {
    const exportVariableStub = sinon.stub(core, "exportVariable");
    sinon.stub(actionsUtil, "isDefaultSetup").returns(true);
    github.context.payload = { repository: undefined };
    const messages: LoggedMessage[] = [];
    logFileCoverageOnPrsDeprecationWarning(getRecordingLogger(messages));
    t.is(messages.length, 1);
    t.is(messages[0].type, "warning");
    t.is(
      messages[0].message,
      "Starting April 2026, the CodeQL Action will skip computing file coverage information on pull requests " +
        "to improve analysis performance. File coverage information will still be computed on non-PR analyses.\n\n" +
        "To opt out of this change, switch to an advanced setup workflow and " +
        "set the `CODEQL_ACTION_FILE_COVERAGE_ON_PRS` environment variable to `true`.",
    );
    t.true(exportVariableStub.calledOnce);
  },
);

test.serial(
  "file coverage deprecation warning for unknown owner type with advanced setup recommends env var",
  (t) => {
    const exportVariableStub = sinon.stub(core, "exportVariable");
    sinon.stub(actionsUtil, "isDefaultSetup").returns(false);
    github.context.payload = { repository: undefined };
    const messages: LoggedMessage[] = [];
    logFileCoverageOnPrsDeprecationWarning(getRecordingLogger(messages));
    t.is(messages.length, 1);
    t.is(messages[0].type, "warning");
    t.is(
      messages[0].message,
      "Starting April 2026, the CodeQL Action will skip computing file coverage information on pull requests " +
        "to improve analysis performance. File coverage information will still be computed on non-PR analyses.\n\n" +
        "To opt out of this change, set the `CODEQL_ACTION_FILE_COVERAGE_ON_PRS` environment variable to `true`.",
    );
    t.true(exportVariableStub.calledOnce);
  },
);

test.serial(
  "logFileCoverageOnPrsDeprecationWarning does not log if already logged",
  (t) => {
    process.env["CODEQL_ACTION_DID_LOG_FILE_COVERAGE_ON_PRS_DEPRECATION"] =
      "true";
    const exportVariableStub = sinon.stub(core, "exportVariable");
    const messages: LoggedMessage[] = [];
    logFileCoverageOnPrsDeprecationWarning(getRecordingLogger(messages));
    t.is(messages.length, 0);
    t.true(exportVariableStub.notCalled);
  },
);
