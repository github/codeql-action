import test from "ava";

import { createTestConfig, initAllState } from "../testing-utils";

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

test("isSwiftCompatible doesn't throw for Swift on darwin", (t) => {
  t.notThrows(() => {
    isSwiftCompatible(
      initAllState({ platform: "darwin" }),
      createTestConfig({ languages: [BuiltInLanguage.swift] }),
    );
  });
});

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
