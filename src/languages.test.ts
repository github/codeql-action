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
  t.deepEqual(parseLanguage("rust"), Language.rust);

  // Aliases
  t.deepEqual(parseLanguage("c"), Language.cpp);
  t.deepEqual(parseLanguage("c++"), Language.cpp);
  t.deepEqual(parseLanguage("c#"), Language.csharp);
  t.deepEqual(parseLanguage("kotlin"), Language.java);
  t.deepEqual(parseLanguage("typescript"), Language.javascript);

  // spaces and case-insensitivity
  t.deepEqual(parseLanguage("  \t\nCsHaRp\t\t"), Language.csharp);
  t.deepEqual(parseLanguage("  \t\nkOtLin\t\t"), Language.java);

  // Not matches
  t.deepEqual(parseLanguage("foo"), undefined);
  t.deepEqual(parseLanguage(" "), undefined);
  t.deepEqual(parseLanguage(""), undefined);
});

test("isTracedLanguage", async (t) => {
  t.true(isTracedLanguage(Language.cpp));
  t.true(isTracedLanguage(Language.csharp));
  t.true(isTracedLanguage(Language.go));
  t.true(isTracedLanguage(Language.java));
  t.true(isTracedLanguage(Language.swift));

  t.false(isTracedLanguage(Language.javascript));
  t.false(isTracedLanguage(Language.python));
  t.false(isTracedLanguage(Language.ruby));
  t.false(isTracedLanguage(Language.rust));
});

test("isScannedLanguage", async (t) => {
  t.false(isScannedLanguage(Language.cpp));
  t.false(isScannedLanguage(Language.csharp));
  t.false(isScannedLanguage(Language.go));
  t.false(isScannedLanguage(Language.java));
  t.false(isScannedLanguage(Language.swift));

  t.true(isScannedLanguage(Language.javascript));
  t.true(isScannedLanguage(Language.python));
  t.true(isScannedLanguage(Language.ruby));
  t.true(isScannedLanguage(Language.rust));
});
