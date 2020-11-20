import test from "ava";

import {
  Language,
  isScannedLanguage,
  isTracedLanguage,
  parseLanguage,
} from "./languages";
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
  t.true(isTracedLanguage(Language.cpp));
  t.true(isTracedLanguage(Language.java));
  t.true(isTracedLanguage(Language.csharp));

  t.false(isTracedLanguage(Language.go));
  t.false(isTracedLanguage(Language.javascript));
  t.false(isTracedLanguage(Language.python));
});

test("isScannedLanguage", async (t) => {
  t.false(isScannedLanguage(Language.cpp));
  t.false(isScannedLanguage(Language.java));
  t.false(isScannedLanguage(Language.csharp));

  t.true(isScannedLanguage(Language.go));
  t.true(isScannedLanguage(Language.javascript));
  t.true(isScannedLanguage(Language.python));
});
