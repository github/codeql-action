#!/usr/bin/env npx tsx

/*
Checks that `runner-images.yml` matches its schema.
*/

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";

import * as jsonschema from "jsonschema";
import * as yaml from "yaml";

import { PR_CHECKS_DIR } from "./config";

describe("runner-images.yml", async () => {
  await it("matches runner-images.schema.json", () => {
    const contents: unknown = yaml.parse(
      fs.readFileSync(path.join(PR_CHECKS_DIR, "runner-images.yml"), "utf8"),
    );
    const schema = JSON.parse(
      fs.readFileSync(
        path.join(PR_CHECKS_DIR, "runner-images.schema.json"),
        "utf8",
      ),
    ) as jsonschema.Schema;
    const result = new jsonschema.Validator().validate(contents, schema);
    assert.deepEqual(
      result.errors.map((error) => error.stack),
      [],
    );
  });
});
