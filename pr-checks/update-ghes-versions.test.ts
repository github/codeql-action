#!/usr/bin/env npx tsx

/*
 * Tests for the update-ghes-versions.ts script
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addWeeks,
  determineSupportedRange,
  type EnterpriseReleases,
  parseEnterpriseVersion,
  printEnterpriseVersion,
} from "./update-ghes-versions";

describe("parseEnterpriseVersion", async () => {
  await it("parses a two-component version string", () => {
    const ver = parseEnterpriseVersion("3.10");
    assert.notEqual(ver, null);
    assert.equal(ver!.major, 3);
    assert.equal(ver!.minor, 10);
    assert.equal(ver!.patch, 0);
  });

  await it("parses a three-component version string", () => {
    const ver = parseEnterpriseVersion("3.10.2");
    assert.notEqual(ver, null);
    assert.equal(ver!.major, 3);
    assert.equal(ver!.minor, 10);
    assert.equal(ver!.patch, 2);
  });

  await it("returns null for invalid input", () => {
    assert.equal(parseEnterpriseVersion("not-a-version"), null);
  });
});

describe("printEnterpriseVersion", async () => {
  await it("prints only major.minor when patch is 0", () => {
    const ver = parseEnterpriseVersion("3.10")!;
    assert.equal(printEnterpriseVersion(ver), "3.10");
  });

  await it("includes patch when non-zero", () => {
    const ver = parseEnterpriseVersion("3.10.2")!;
    assert.equal(printEnterpriseVersion(ver), "3.10.2");
  });
});

describe("addWeeks", async () => {
  await it("adds weeks to a date", () => {
    const date = new Date("2025-01-01T00:00:00Z");
    const result = addWeeks(date, 2);
    assert.equal(result.toISOString(), "2025-01-15T00:00:00.000Z");
  });

  await it("does not mutate the original date", () => {
    const date = new Date("2025-01-01T00:00:00Z");
    addWeeks(date, 2);
    assert.equal(date.toISOString(), "2025-01-01T00:00:00.000Z");
  });
});

/**
 * Helper to build a release entry with a feature freeze and end-of-life date.
 * Dates are ISO date strings (e.g. "2025-06-01").
 */
function release(featureFreeze: string, end: string) {
  return { feature_freeze: featureFreeze, end };
}

describe("determineSupportedRange", async () => {
  // A fixed "today" for deterministic tests.
  const today = new Date("2025-06-15");

  const farPastEnd = "2020-01-01";
  const farFutureEnd = "2099-12-31";
  const farPastFreeze = "2020-01-01";
  const farFutureFreeze = "2099-12-31";

  await it("returns the only supported release as both min and max", () => {
    const releases: EnterpriseReleases = {
      "3.10": release(farPastFreeze, farFutureEnd),
    };
    const result = determineSupportedRange(
      today,
      { minimumVersion: "3.10", maximumVersion: "3.10" },
      releases,
    );
    assert.equal(result.minimumVersion, "3.10");
    assert.equal(result.maximumVersion, "3.10");
  });

  await it("determines the range from multiple supported releases", () => {
    const releases: EnterpriseReleases = {
      "3.10": release(farPastFreeze, farFutureEnd),
      "3.11": release(farPastFreeze, farFutureEnd),
      "3.12": release(farPastFreeze, farFutureEnd),
    };
    const result = determineSupportedRange(
      today,
      { minimumVersion: "3.10", maximumVersion: "3.12" },
      releases,
    );
    assert.equal(result.minimumVersion, "3.10");
    assert.equal(result.maximumVersion, "3.12");
  });

  await it("drops an end-of-life release from the minimum", () => {
    const releases: EnterpriseReleases = {
      // 3.10 has been end of life for a long time.
      "3.10": release(farPastFreeze, farPastEnd),
      "3.11": release(farPastFreeze, farFutureEnd),
      "3.12": release(farPastFreeze, farFutureEnd),
    };
    const result = determineSupportedRange(
      today,
      { minimumVersion: "3.10", maximumVersion: "3.12" },
      releases,
    );
    assert.equal(result.minimumVersion, "3.11");
    assert.equal(result.maximumVersion, "3.12");
  });

  await it("bumps the maximum when a newer release's feature freeze has passed", () => {
    const releases: EnterpriseReleases = {
      "3.10": release(farPastFreeze, farFutureEnd),
      "3.11": release(farPastFreeze, farFutureEnd),
      // 3.12 has a feature freeze far in the past, so it should be picked up.
      "3.12": release(farPastFreeze, farFutureEnd),
    };
    const result = determineSupportedRange(
      today,
      // The stored maximum is 3.11, but 3.12 should be picked up.
      { minimumVersion: "3.10", maximumVersion: "3.11" },
      releases,
    );
    assert.equal(result.minimumVersion, "3.10");
    assert.equal(result.maximumVersion, "3.12");
  });

  await it("does not bump the maximum when feature freeze is far in the future", () => {
    const releases: EnterpriseReleases = {
      "3.10": release(farPastFreeze, farFutureEnd),
      "3.11": release(farPastFreeze, farFutureEnd),
      // 3.12 has a feature freeze far in the future, so it should NOT be picked up.
      "3.12": release(farFutureFreeze, farFutureEnd),
    };
    const result = determineSupportedRange(
      today,
      { minimumVersion: "3.10", maximumVersion: "3.11" },
      releases,
    );
    assert.equal(result.minimumVersion, "3.10");
    assert.equal(result.maximumVersion, "3.11");
  });

  await it("ignores releases older than the first supported release (2.22)", () => {
    const releases: EnterpriseReleases = {
      "2.21": release(farPastFreeze, farFutureEnd),
      "3.10": release(farPastFreeze, farFutureEnd),
      "3.11": release(farPastFreeze, farFutureEnd),
    };
    const result = determineSupportedRange(
      today,
      { minimumVersion: "3.10", maximumVersion: "3.11" },
      releases,
    );
    // 2.21 is older than 2.22, so it should be ignored — 3.10 remains the minimum.
    assert.equal(result.minimumVersion, "3.10");
    assert.equal(result.maximumVersion, "3.11");
  });

  await it("throws when no supported releases remain", () => {
    const releases: EnterpriseReleases = {
      // All releases are end of life.
      "3.10": release(farPastFreeze, farPastEnd),
      "3.11": release(farPastFreeze, farPastEnd),
    };
    assert.throws(
      () =>
        determineSupportedRange(
          today,
          { minimumVersion: "3.10", maximumVersion: "3.11" },
          releases,
        ),
      /Could not determine oldest supported release/,
    );
  });

  await it("throws when maximumVersion is not a valid version", () => {
    assert.throws(
      () =>
        determineSupportedRange(
          today,
          { minimumVersion: "3.10", maximumVersion: "invalid" },
          {},
        ),
      /is not a valid semantic version/,
    );
  });
});
