import * as path from "path";

import test from "ava";

import { countLoc } from "./count-loc";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";

setupTests(test);

test("ensure lines of code works for cpp and js", async (t) => {
  const results = await countLoc(
    path.join(__dirname, "../tests/multi-language-repo"),
    [],
    [],
    [Language.cpp, Language.javascript],
    getRunnerLogger(true)
  );

  t.deepEqual(results, {
    cpp: 6,
    js: 3,
  });
});

test("ensure lines of code can handle undefined language", async (t) => {
  const results = await countLoc(
    path.join(__dirname, "../tests/multi-language-repo"),
    [],
    [],
    [Language.javascript, Language.python, "hucairz" as Language],
    getRunnerLogger(true)
  );

  t.deepEqual(results, {
    js: 3,
    py: 5,
  });
});

test("ensure lines of code can handle empty languages", async (t) => {
  const results = await countLoc(
    path.join(__dirname, "../tests/multi-language-repo"),
    [],
    [],
    [],
    getRunnerLogger(true)
  );

  t.deepEqual(results, {});
});

test("ensure lines of code can handle includes", async (t) => {
  // note that "**" is always included. The includes are for extra
  // directories outside the normal structure.
  const results = await countLoc(
    path.join(__dirname, "../tests/multi-language-repo"),
    ["../../src/testdata"],
    [],
    [Language.javascript],
    getRunnerLogger(true)
  );

  t.deepEqual(results, {
    js: 15,
  });
});

test("ensure lines of code can handle exclude", async (t) => {
  const results = await countLoc(
    path.join(__dirname, "../tests/multi-language-repo"),
    [],
    ["**/*.py"],
    [Language.javascript, Language.python],
    getRunnerLogger(true)
  );

  t.deepEqual(results, {
    js: 3,
  });
});
