/**
 * Tests for `check-cs-config.ts`.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UserConfig } from "../src/config/db-config";

import { checkConfiguration } from "./check-cs-config";

describe("checkConfiguration", async () => {
  await it("passes when actual and expected configs match", () => {
    const actual: UserConfig = { name: "test-config", paths: ["src"] };
    const expected = JSON.stringify(actual);
    assert.doesNotThrow(() => checkConfiguration(actual, expected));
  });

  await it("passes when queries arrays match after sorting", () => {
    const actual: UserConfig = { paths: ["b", "a", "c"] };
    const expected = JSON.stringify(actual);
    assert.doesNotThrow(() => checkConfiguration(actual, expected));
  });

  await it("throws when actual config does not match expected", () => {
    const actual: UserConfig = { name: "actual-name" };
    const expected = JSON.stringify({
      name: "expected-name",
    } satisfies UserConfig);
    assert.throws(() => checkConfiguration(actual, expected), {
      message: /Expected configuration does not match actual configuration/,
    });
  });

  await it("throws when expected contents are empty", () => {
    assert.throws(() => checkConfiguration({}, ""), {
      message: /No expected configuration provided/,
    });
  });

  await it("throws when expected contents are only whitespace", () => {
    assert.throws(() => checkConfiguration({}, "   "), {
      message: /No expected configuration provided/,
    });
  });

  await it("passes with complex config", () => {
    const actual: UserConfig = {
      name: "complex",
      "disable-default-queries": true,
      paths: ["src", "lib"],
      "paths-ignore": ["test"],
      "threat-models": ["remote"],
    };
    const expected = JSON.stringify(actual);
    assert.doesNotThrow(() => checkConfiguration(actual, expected));
  });

  await it("trims whitespace from expected contents before parsing", () => {
    const actual: UserConfig = { name: "trimmed" };
    const expected = `  ${JSON.stringify(actual)}  `;
    assert.doesNotThrow(() => checkConfiguration(actual, expected));
  });

  await it("passes when both configs are empty objects", () => {
    assert.doesNotThrow(() => checkConfiguration({}, "{}"));
  });
});
