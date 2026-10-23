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

import { checkSwiftCompatibility } from "./swift";

import { BuiltInLanguage } from ".";

test("checkSwiftCompatibility doesn't throw for non-Swift languages", (t) => {
  for (const language of Object.values(BuiltInLanguage)) {
    if (language === BuiltInLanguage.swift) {
      continue;
    }

    t.notThrows(() =>
      checkSwiftCompatibility(
        initAllState(),
        createTestConfig({ languages: [language] }),
      ),
    );
  }
});

test("checkSwiftCompatibility doesn't throw for Swift on darwin", async (t) =>
  withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger();
    const env = getTestEnv();
    env.set(ActionsEnvVars.RUNNER_TEMP, tmpDir);

    const codeql = await getCodeQLForTesting("codeql-for-testing", logger, env);
    sinon.stub(codeql, "getVersion").resolves(makeVersionInfo("2.27.0"));

    t.notThrows(() =>
      checkSwiftCompatibility(
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
  test(`checkSwiftCompatibility throws for Swift on ${nonDarwinPlatform}`, (t) => {
    t.throws(() => {
      checkSwiftCompatibility(
        initAllState({ platform: nonDarwinPlatform }),
        createTestConfig({ languages: [BuiltInLanguage.swift] }),
      );
    });
  });
}
