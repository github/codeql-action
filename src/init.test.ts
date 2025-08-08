import * as fs from "fs";
import path from "path";

import test, { ExecutionContext } from "ava";

import { createStubCodeQL } from "./codeql";
import {
  checkPacksForOverlayCompatibility,
  cleanupDatabaseClusterDirectory,
} from "./init";
import { KnownLanguage } from "./languages";
import {
  LoggedMessage,
  createTestConfig,
  getRecordingLogger,
  setupTests,
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
  test(`cleanupDatabaseClusterDirectory throws a ${ErrorConstructor.name} when cleanup fails on ${runnerEnv} runner`, async (t) => {
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
  });
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
  language: KnownLanguage;
  packinfoContents: string | undefined;
  sourceOnlyPack?: boolean;
  qlpackFileName?: string;
};

const testCheckPacksForOverlayCompatibility = test.macro({
  exec: async (
    t: ExecutionContext,
    _title: string,
    {
      cliOverlayVersion,
      languages,
      packs,
      expectedResult,
    }: {
      cliOverlayVersion: number | undefined;
      languages: KnownLanguage[];
      packs: Record<string, PackInfo>;
      expectedResult: boolean;
    },
  ) => {
    await withTmpDir(async (tmpDir) => {
      const packDirsByLanguage = new Map<KnownLanguage, string[]>();

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
  title: (_, title) => `checkPacksForOverlayCompatibility: ${title}`,
});

test(
  testCheckPacksForOverlayCompatibility,
  "returns false when CLI does not support overlay",
  {
    cliOverlayVersion: undefined,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: false,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns true when there are no query packs",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {},
    expectedResult: true,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns true when query pack has not been compiled",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: undefined,
        sourceOnlyPack: true,
      },
    },
    expectedResult: true,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns true when query pack has expected overlay version",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: true,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns true when query packs for all languages to analyze are compatible",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.cpp, KnownLanguage.java],
    packs: {
      "codeql/cpp-queries": {
        language: KnownLanguage.cpp,
        packinfoContents: '{"overlayVersion":2}',
      },
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: true,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns true when query pack for a language not analyzed is incompatible",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/cpp-queries": {
        language: KnownLanguage.cpp,
        packinfoContents: undefined,
      },
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: true,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns false when query pack for a language to analyze is incompatible",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.cpp, KnownLanguage.java],
    packs: {
      "codeql/cpp-queries": {
        language: KnownLanguage.cpp,
        packinfoContents: '{"overlayVersion":1}',
      },
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
    },
    expectedResult: false,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns false when query pack is missing .packinfo",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
      "custom/queries": {
        language: KnownLanguage.java,
        packinfoContents: undefined,
      },
    },
    expectedResult: false,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns false when query pack has different overlay version",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
      "custom/queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":1}',
      },
    },
    expectedResult: false,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns false when query pack is missing overlayVersion in .packinfo",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
      "custom/queries": {
        language: KnownLanguage.java,
        packinfoContents: "{}",
      },
    },
    expectedResult: false,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns false when .packinfo is not valid JSON",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
      },
      "custom/queries": {
        language: KnownLanguage.java,
        packinfoContents: "this_is_not_valid_json",
      },
    },
    expectedResult: false,
  },
);

test(
  testCheckPacksForOverlayCompatibility,
  "returns true when query pack uses codeql-pack.yml filename",
  {
    cliOverlayVersion: 2,
    languages: [KnownLanguage.java],
    packs: {
      "codeql/java-queries": {
        language: KnownLanguage.java,
        packinfoContents: '{"overlayVersion":2}',
        qlpackFileName: "codeql-pack.yml",
      },
    },
    expectedResult: true,
  },
);
