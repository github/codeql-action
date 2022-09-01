import test from "ava";

import {
  Language,
  isScannedLanguage,
  isTracedLanguage,
  parseLanguage,
} from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";

setupTests(test);

test("parseLanguage", async (t) => {
  // Exact matches
  t.deepEqual(parseLanguage("csharp"), Language.csharp);
  t.deepEqual(parseLanguage("cpp"), Language.cpp);
  t.deepEqual(parseLanguage("go"), Language.go);
  t.deepEqual(parseLanguage("java"), Language.java);
  t.deepEqual(parseLanguage("javascript"), Language.javascript);
  t.deepEqual(parseLanguage("python"), Language.python);

  // Aliases
  t.deepEqual(parseLanguage("c"), Language.cpp);
  t.deepEqual(parseLanguage("c++"), Language.cpp);
  t.deepEqual(parseLanguage("c#"), Language.csharp);
  t.deepEqual(parseLanguage("typescript"), Language.javascript);

  // Not matches
  t.deepEqual(parseLanguage("foo"), undefined);
  t.deepEqual(parseLanguage(" "), undefined);
  t.deepEqual(parseLanguage(""), undefined);
});

for (const isReconciliationOn of [false, true]) {
  test(`isTracedLanguage (go reconciliation ${
    isReconciliationOn ? "enabled" : "disabled"
  }`, async (t) => {
    const logger = getRunnerLogger(true);

    t.true(isTracedLanguage(Language.cpp, isReconciliationOn, logger));
    t.true(isTracedLanguage(Language.java, isReconciliationOn, logger));
    t.true(isTracedLanguage(Language.csharp, isReconciliationOn, logger));

    t.is(
      isTracedLanguage(Language.go, isReconciliationOn, logger),
      isReconciliationOn
    );

    t.false(isTracedLanguage(Language.javascript, isReconciliationOn, logger));
    t.false(isTracedLanguage(Language.python, isReconciliationOn, logger));
  });

  test(`isScannedLanguage (go reconciliation ${
    isReconciliationOn ? "enabled" : "disabled"
  }`, async (t) => {
    const logger = getRunnerLogger(true);

    t.false(isScannedLanguage(Language.cpp, isReconciliationOn, logger));
    t.false(isScannedLanguage(Language.java, isReconciliationOn, logger));
    t.false(isScannedLanguage(Language.csharp, isReconciliationOn, logger));

    t.is(
      isScannedLanguage(Language.go, isReconciliationOn, logger),
      !isReconciliationOn
    );

    t.true(isScannedLanguage(Language.javascript, isReconciliationOn, logger));
    t.true(isScannedLanguage(Language.python, isReconciliationOn, logger));
  });
}
