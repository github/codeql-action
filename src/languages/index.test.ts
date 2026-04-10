import test from "ava";

import { setupTests } from "../testing-utils";

import knownLanguagesData from "./builtin.json";

import { isKnownLanguage, KnownLanguage, parseBuiltInLanguage } from ".";

setupTests(test);

test("parseBuiltInLanguage", (t) => {
  // Exact matches
  t.is(parseBuiltInLanguage("csharp"), KnownLanguage.csharp);
  t.is(parseBuiltInLanguage("cpp"), KnownLanguage.cpp);
  t.is(parseBuiltInLanguage("go"), KnownLanguage.go);
  t.is(parseBuiltInLanguage("java"), KnownLanguage.java);
  t.is(parseBuiltInLanguage("javascript"), KnownLanguage.javascript);
  t.is(parseBuiltInLanguage("python"), KnownLanguage.python);
  t.is(parseBuiltInLanguage("rust"), KnownLanguage.rust);

  // Aliases
  t.is(parseBuiltInLanguage("  \t\nCsHaRp\t\t"), KnownLanguage.csharp);
  t.is(parseBuiltInLanguage("c"), KnownLanguage.cpp);
  t.is(parseBuiltInLanguage("c++"), KnownLanguage.cpp);
  t.is(parseBuiltInLanguage("kotlin"), KnownLanguage.java);
  t.is(parseBuiltInLanguage("typescript"), KnownLanguage.javascript);

  // spaces and case-insensitivity
  t.is(parseBuiltInLanguage("  \t\nkOtLin\t\t"), KnownLanguage.java);

  // Not matches
  t.is(parseBuiltInLanguage(KnownLanguage.python), KnownLanguage.python);
  t.is(parseBuiltInLanguage("foo"), undefined);
  t.is(parseBuiltInLanguage(" "), undefined);
  t.is(parseBuiltInLanguage(""), undefined);
});

test("isKnownLanguage matches the curated known-language set", (t) => {
  t.true(isKnownLanguage(KnownLanguage.actions));
  t.true(isKnownLanguage(KnownLanguage.swift));
  t.false(isKnownLanguage("typescript"));
});

test("KnownLanguage enum matches builtin.json", (t) => {
  t.deepEqual(Object.values(KnownLanguage), knownLanguagesData.languages);
});
