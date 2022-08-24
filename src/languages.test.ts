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

test("isTracedLanguage", async (t) => {
  const logger = getRunnerLogger(true);

  t.true(isTracedLanguage(Language.cpp, logger));
  t.true(isTracedLanguage(Language.java, logger));
  t.true(isTracedLanguage(Language.csharp, logger));

  t.false(isTracedLanguage(Language.go, logger));
  t.false(isTracedLanguage(Language.javascript, logger));
  t.false(isTracedLanguage(Language.python, logger));
});

test("isScannedLanguage", async (t) => {
  const logger = getRunnerLogger(true);

  t.false(isScannedLanguage(Language.cpp, logger));
  t.false(isScannedLanguage(Language.java, logger));
  t.false(isScannedLanguage(Language.csharp, logger));

  t.true(isScannedLanguage(Language.go, logger));
  t.true(isScannedLanguage(Language.javascript, logger));
  t.true(isScannedLanguage(Language.python, logger));
});
