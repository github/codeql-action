#!/usr/bin/env npx tsx

/*
Tests for the sync-checks.ts script
*/

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CheckInfo,
  Exclusions,
  Options,
  removeExcluded,
  resolveToken,
} from "./sync-checks";

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

describe("resolveToken", async () => {
  await it("reads the token from standard input", async () => {
    const token = await resolveToken(
      { tokenStdin: true },
      { env: {}, readStdin: async () => " stdin-token\n" },
    );
    assert.equal(token, "stdin-token");
  });

  await it("reads the token from the GH_TOKEN environment variable", async () => {
    const token = await resolveToken(
      {},
      { env: { GH_TOKEN: "env-token" }, readStdin: async () => "" },
    );
    assert.equal(token, "env-token");
  });

  await it("reads the token from the GITHUB_TOKEN environment variable", async () => {
    const token = await resolveToken(
      {},
      { env: { GITHUB_TOKEN: "env-token" }, readStdin: async () => "" },
    );
    assert.equal(token, "env-token");
  });

  await it("rejects an empty standard input token", async () => {
    await assert.rejects(
      resolveToken(
        { tokenStdin: true },
        { env: {}, readStdin: async () => "\n" },
      ),
      /No token received on standard input/,
    );
  });

  await it("rejects missing token sources", async () => {
    await assert.rejects(
      resolveToken({}, { env: {}, readStdin: async () => "" }),
      /Missing authentication token/,
    );
  });
});
