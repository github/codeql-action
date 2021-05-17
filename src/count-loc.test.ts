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
    javascript: 3,
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
    javascript: 3,
    python: 5,
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
    javascript: 12,
  });
});

test("ensure lines of code can handle empty includes", async (t) => {
  // note that "**" is always included. The includes are for extra
  // directories outside the normal structure.
  const results = await countLoc(
    path.join(__dirname, "../tests/multi-language-repo"),
    ["idontexist"],
    [],
    [Language.javascript],
    getRunnerLogger(true)
  );

  t.deepEqual(results, {
    // should get no results
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
    javascript: 3,
  });
});
