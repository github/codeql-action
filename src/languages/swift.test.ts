import test from "ava";
import sinon from "sinon";

import { ActionsEnvVars } from "../environment";
import {
  createTestConfig,
  getCodeQLForTesting,
  getTestEnv,
  initAllState,
  makeVersionInfo,
  RecordingLogger,
} from "../testing-utils";
import { withTmpDir } from "../util";

import { isSwiftCompatible } from "./swift";

import { BuiltInLanguage } from ".";

test("isSwiftCompatible doesn't throw for non-Swift languages", (t) => {
  for (const language of Object.values(BuiltInLanguage)) {
    if (language === BuiltInLanguage.swift) {
      continue;
    }

    t.notThrows(() =>
      isSwiftCompatible(
        initAllState(),
        createTestConfig({ languages: [language] }),
      ),
    );
  }
});

test("isSwiftCompatible doesn't throw for Swift on darwin", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

    const codeql = await getCodeQLForTesting("codeql-for-testing", logger, env);
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    t.notThrows(() =>
      isSwiftCompatible(
        initAllState({ platform: "darwin", env, logger }),
        createTestConfig({
          tempDir: tmpDir,
          languages: [BuiltInLanguage.swift],
        }),
      ),
    );
  }));

const nonDarwinPlatforms: NodeJS.Platform[] = ["linux", "win32"];
for (const nonDarwinPlatform of nonDarwinPlatforms) {
  test(`isSwiftCompatible throws for Swift on ${nonDarwinPlatform}`, (t) => {
    t.throws(() => {
      isSwiftCompatible(
        initAllState({ platform: nonDarwinPlatform }),
        createTestConfig({ languages: [BuiltInLanguage.swift] }),
      );
    });
  });
}
