import * as fs from "fs";

import test from "ava";

import { setupTests } from "../testing-utils";

import { getToolNames, type Log } from ".";

setupTests(test);

test("getToolNames", (t) => {
  const input = fs.readFileSync(
    `${__dirname}/../../src/testdata/tool-names.sarif`,
    "utf8",
  );
  const toolNames = getToolNames(JSON.parse(input) as Log);
  t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});
