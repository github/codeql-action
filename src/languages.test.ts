import test from "ava";

import { Language, parseLanguage } from "./languages";
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
