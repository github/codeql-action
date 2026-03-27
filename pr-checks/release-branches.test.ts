#!/usr/bin/env npx tsx

/*
Tests for the release-branches.ts script
*/

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeBackportBranches } from "./release-branches";

describe("computeBackportBranches", async () => {
  await it("rejects invalid major versions", () => {
    // The majorVersion is expected to be in vN format.
    assert.throws(() => computeBackportBranches("3", "v4.28.0", 3));
    assert.throws(() => computeBackportBranches("v3.1", "v4.28.0", 3));
  });

  await it("rejects invalid latest tags", () => {
    // The latestTag is expected to be in vN.M.P format.
    assert.throws(() => computeBackportBranches("v3", "v4", 3));
    assert.throws(() => computeBackportBranches("v3", "4", 3));
    assert.throws(() => computeBackportBranches("v3", "v4.28", 3));
    assert.throws(() => computeBackportBranches("v3", "4.28", 3));
    assert.throws(() => computeBackportBranches("v3", "4.28.0", 3));
  });

  await it("sets backport source branch based on major version", () => {
    // Test that the backport source branch is releases/v{majorVersion}
    const result = computeBackportBranches("v3", "v4.28.0", 3);
    assert.equal(result.backportSourceBranch, "releases/v3");
  });

  await it("no backport targets when major version is the oldest supported", () => {
    // When majorVersion equals the major version of latestTag and we do not support older major versions,
    // then there are no older supported branches to backport to.
    const result = computeBackportBranches("v3", "v3.28.0", 3);
    assert.deepEqual(result.backportTargetBranches, []);
  });

  await it("backports to older supported major versions", () => {
    const result = computeBackportBranches("v4", "v4.1.0", 3);
    assert.equal(result.backportSourceBranch, "releases/v4");
    assert.deepEqual(result.backportTargetBranches, ["releases/v3"]);
  });

  await it("backports to multiple older supported branches", () => {
    const result = computeBackportBranches("v5", "v5.0.0", 3);
    assert.equal(result.backportSourceBranch, "releases/v5");
    assert.deepEqual(result.backportTargetBranches, [
      "releases/v4",
      "releases/v3",
    ]);
  });

  await it("does not backport when major version is older than latest tag", () => {
    const result = computeBackportBranches("v2", "v3.28.0", 2);
    assert.equal(result.backportSourceBranch, "releases/v2");
    assert.deepEqual(result.backportTargetBranches, []);
  });
});
