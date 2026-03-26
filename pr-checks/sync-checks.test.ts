#!/usr/bin/env npx tsx

/*
Tests for the sync-checks.ts script
*/

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CheckInfo, Exclusions, Options, removeExcluded } from "./sync-checks";

const defaultOptions: Options = {
  apply: false,
  verbose: false,
};

const toCheckInfo = (name: string) =>
  ({ context: name, app_id: -1 }) satisfies CheckInfo;

const expectedPartialMatches = ["PR Check - Foo", "https://example.com"].map(
  toCheckInfo,
);

const expectedExactMatches = ["CodeQL", "Update"].map(toCheckInfo);

const testChecks = expectedExactMatches.concat(expectedPartialMatches);

const emptyExclusions: Exclusions = {
  is: [],
  contains: [],
};

describe("removeExcluded", async () => {
  await it("retains all checks if no exclusions are configured", () => {
    const retained = removeExcluded(
      defaultOptions,
      emptyExclusions,
      testChecks,
    );
    assert.deepEqual(retained, testChecks);
  });

  await it("removes exact matches", () => {
    const retained = removeExcluded(
      defaultOptions,
      { ...emptyExclusions, is: ["CodeQL", "Update"] },
      testChecks,
    );
    assert.deepEqual(retained, expectedPartialMatches);
  });

  await it("removes partial matches", () => {
    const retained = removeExcluded(
      defaultOptions,
      { ...emptyExclusions, contains: ["https://", "PR Check"] },
      testChecks,
    );
    assert.deepEqual(retained, expectedExactMatches);
  });
});
