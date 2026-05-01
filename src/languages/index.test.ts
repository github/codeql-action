import test from "ava";

import { setupTests } from "../testing-utils";

import knownLanguagesData from "./builtin.json";

import { isBuiltInLanguage, BuiltInLanguage, parseBuiltInLanguage } from ".";

setupTests(test);

test("parseBuiltInLanguage", (t) => {
  // Exact matches
  t.is(parseBuiltInLanguage("csharp"), BuiltInLanguage.csharp);
  t.is(parseBuiltInLanguage("cpp"), BuiltInLanguage.cpp);
  t.is(parseBuiltInLanguage("go"), BuiltInLanguage.go);
  t.is(parseBuiltInLanguage("java"), BuiltInLanguage.java);
  t.is(parseBuiltInLanguage("javascript"), BuiltInLanguage.javascript);
  t.is(parseBuiltInLanguage("python"), BuiltInLanguage.python);
  t.is(parseBuiltInLanguage("rust"), BuiltInLanguage.rust);

  // Aliases
  t.is(parseBuiltInLanguage("  \t\nCsHaRp\t\t"), BuiltInLanguage.csharp);
  t.is(parseBuiltInLanguage("c"), BuiltInLanguage.cpp);
  t.is(parseBuiltInLanguage("c++"), BuiltInLanguage.cpp);
  t.is(parseBuiltInLanguage("kotlin"), BuiltInLanguage.java);
  t.is(parseBuiltInLanguage("typescript"), BuiltInLanguage.javascript);

  // spaces and case-insensitivity
  t.is(parseBuiltInLanguage("  \t\nkOtLin\t\t"), BuiltInLanguage.java);

  // Not matches
  t.is(parseBuiltInLanguage(BuiltInLanguage.python), BuiltInLanguage.python);
  t.is(parseBuiltInLanguage("foo"), undefined);
  t.is(parseBuiltInLanguage(" "), undefined);
  t.is(parseBuiltInLanguage(""), undefined);
});

test("isBuiltInLanguage matches the curated built-in language set", (t) => {
  t.true(isBuiltInLanguage(BuiltInLanguage.actions));
  t.true(isBuiltInLanguage(BuiltInLanguage.swift));
  t.false(isBuiltInLanguage("typescript"));
});

test("BuiltInLanguage enum matches builtin.json", (t) => {
  t.deepEqual(Object.values(BuiltInLanguage), knownLanguagesData.languages);
});
