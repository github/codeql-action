import test from "ava";

import {
  KnownLanguage,
  isScannedLanguage,
  isTracedLanguage,
  parseLanguage,
} from "./languages";
import { setupTests } from "./testing-utils";

setupTests(test);

test("parseLanguage", async (t) => {
  // Exact matches
  t.deepEqual(parseLanguage("csharp"), KnownLanguage.csharp);
  t.deepEqual(parseLanguage("cpp"), KnownLanguage.cpp);
  t.deepEqual(parseLanguage("go"), KnownLanguage.go);
  t.deepEqual(parseLanguage("java"), KnownLanguage.java);
  t.deepEqual(parseLanguage("javascript"), KnownLanguage.javascript);
  t.deepEqual(parseLanguage("python"), KnownLanguage.python);

  // Aliases
  t.deepEqual(parseLanguage("c"), KnownLanguage.cpp);
  t.deepEqual(parseLanguage("c++"), KnownLanguage.cpp);
  t.deepEqual(parseLanguage("c#"), KnownLanguage.csharp);
  t.deepEqual(parseLanguage("typescript"), KnownLanguage.javascript);

  // Not matches
  t.deepEqual(parseLanguage("foo"), undefined);
  t.deepEqual(parseLanguage(" "), undefined);
  t.deepEqual(parseLanguage(""), undefined);
});

test("isTracedLanguage", async (t) => {
  t.true(isTracedLanguage(KnownLanguage.cpp));
  t.true(isTracedLanguage(KnownLanguage.java));
  t.true(isTracedLanguage(KnownLanguage.csharp));

  t.false(isTracedLanguage(KnownLanguage.go));
  t.false(isTracedLanguage(KnownLanguage.javascript));
  t.false(isTracedLanguage(KnownLanguage.python));
});

test("isScannedLanguage", async (t) => {
  t.false(isScannedLanguage(KnownLanguage.cpp));
  t.false(isScannedLanguage(KnownLanguage.java));
  t.false(isScannedLanguage(KnownLanguage.csharp));

  t.true(isScannedLanguage(KnownLanguage.go));
  t.true(isScannedLanguage(KnownLanguage.javascript));
  t.true(isScannedLanguage(KnownLanguage.python));
});
