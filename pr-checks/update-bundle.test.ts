/*
 * Tests for the update-bundle.ts script.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Defaults, getNewDefaults } from "./update-bundle";

const testDefaults: Defaults = {
  bundleVersion: "codeql-bundle-v2.26.2",
  cliVersion: "2.26.2",
  priorBundleVersion: "codeql-bundle-v2.26.1",
  priorCliVersion: "2.26.1",
};

describe("getNewDefaults", async () => {
  await it("throws if there is no cli-version-*.txt asset", async () => {
    assert.throws(
      () => getNewDefaults({ tag_name: "foo", assets: [] }, testDefaults),
      { message: "Failed to find the CodeQL CLI version for release foo." },
    );
  });

  await it("throws if there are multiple cli-version-*.txt assets", async () => {
    assert.throws(
      () =>
        getNewDefaults(
          {
            tag_name: "foo",
            assets: [
              { name: "cli-version-foo.txt" },
              { name: "cli-version-bar.txt" },
            ],
          },
          testDefaults,
        ),
      { message: "Release foo has multiple CLI version marker files." },
    );
  });

  await it("finds the new bundle info", async () => {
    const newDefaults = getNewDefaults(
      {
        tag_name: "foo",
        assets: [{ name: "cli-version-1.2.3.txt" }],
      },
      testDefaults,
    );

    assert.deepEqual(newDefaults, {
      bundleVersion: "foo",
      cliVersion: "1.2.3",
      priorBundleVersion: testDefaults.bundleVersion,
      priorCliVersion: testDefaults.cliVersion,
    } satisfies Defaults);
  });
});
