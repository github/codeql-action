import test from "ava";

import type { FileDiff } from "../diff-informed";
import { setupTests } from "../testing-utils";

import { matchPatterns, relevantChangeFor } from "./changes";

setupTests(test);

function mkTestDiff(filename: string): FileDiff {
  return { filename, changes: 42 };
}

test("matchPatterns - true if any pattern matches", (t) => {
  t.true(matchPatterns("/path/to/file.js", ["*.js"]));
  t.true(matchPatterns("/path/to", ["/path/**"]));
  t.true(matchPatterns("/path/to", ["foo.txt", "/path/**"]));
  t.true(matchPatterns("/path/to", ["foo.txt", "/path/from", "/path/to*"]));
});

test("matchPatterns - false if no pattern matches", (t) => {
  t.false(matchPatterns("/path/to", []));
  t.false(matchPatterns("/path/to", ["/some/path/**"]));
});

test("relevantChangeFor - relevant if expected", (t) => {
  // No configuration: all files are relevant
  t.true(relevantChangeFor({}, mkTestDiff("/path/to/file.js")));

  // Various configurations that we expect to match the given path.
  t.true(
    relevantChangeFor({ patterns: ["*.js"] }, mkTestDiff("/path/to/file.js")),
  );
  t.true(
    relevantChangeFor(
      { patterns: ["/path/**"] },
      mkTestDiff("/path/to/file.js"),
    ),
  );

  // `exclude` configuration doesn't apply
  t.true(
    relevantChangeFor({ exclude: ["*.ts"] }, mkTestDiff("/path/to/file.js")),
  );
  t.true(
    relevantChangeFor(
      { patterns: ["*.js"], exclude: ["file.ts"] },
      mkTestDiff("/path/to/file.js"),
    ),
  );
  t.true(
    relevantChangeFor(
      { patterns: ["/path/**"], exclude: ["/path/to/**/*.ts"] },
      mkTestDiff("/path/to/file.js"),
    ),
  );
});

test("relevantChangeFor - exclude patterns filter results", (t) => {
  // No patterns: all files are relevant, but `exclude` filters `.js` files.
  t.false(
    relevantChangeFor({ exclude: ["*.js"] }, mkTestDiff("/path/to/file.js")),
  );

  // Various `patterns` configurations that we expect to match the given path and
  // more specific `exclude` configurations that we expect to also match.
  t.false(
    relevantChangeFor(
      { patterns: ["*.js"], exclude: ["file.js"] },
      mkTestDiff("/path/to/file.js"),
    ),
  );
  t.false(
    relevantChangeFor(
      { patterns: ["/path/**"], exclude: ["/path/to/**/*.js"] },
      mkTestDiff("/path/to/file.js"),
    ),
  );
});
