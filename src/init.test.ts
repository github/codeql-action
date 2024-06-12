import * as fs from "fs";
import path from "path";

import test from "ava";

import { Config } from "./config-utils";
import {
  cleanupDatabaseClusterDirectory,
  printPathFiltersWarning,
} from "./init";
import { Language } from "./languages";
import {
  LoggedMessage,
  createTestConfig,
  getRecordingLogger,
  setupTests,
} from "./testing-utils";
import { ConfigurationError, withTmpDir } from "./util";

setupTests(test);

test("printPathFiltersWarning does not trigger when 'paths' and 'paths-ignore' are undefined", async (t) => {
  const messages: LoggedMessage[] = [];
  printPathFiltersWarning(
    {
      languages: [Language.cpp],
      originalUserInput: {},
    } as Partial<Config> as Config,
    getRecordingLogger(messages),
  );
  t.is(messages.length, 0);
});

test("printPathFiltersWarning does not trigger when 'paths' and 'paths-ignore' are empty", async (t) => {
  const messages: LoggedMessage[] = [];
  printPathFiltersWarning(
    {
      languages: [Language.cpp],
      originalUserInput: { paths: [], "paths-ignore": [] },
    } as Partial<Config> as Config,
    getRecordingLogger(messages),
  );
  t.is(messages.length, 0);
});

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
