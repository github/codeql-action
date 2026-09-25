/**
 * Tests for `check-sarif.ts`.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Log } from "sarif";

import { checkSarif } from "./check-sarif";

/** Builds a minimal SARIF Log with the given rule IDs spread across extensions. */
function buildSarifLog(ruleIds: string[]): Log {
  return {
    version: "2.1.0",
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: { name: "CodeQL" },
          extensions: [
            {
              name: "test-pack",
              rules: ruleIds.map((id) => ({ id })),
            },
          ],
        },
        results: [],
      },
    ],
  };
}

describe("checkSarif", async () => {
  await it("returns 0 when all expected queries ran and no unexpected queries ran", () => {
    const sarif = buildSarifLog(["js/sql-injection", "js/xss"]);
    const exitCode = checkSarif(sarif, {
      sarifFile: "test.sarif",
      queriesRun: "js/sql-injection, js/xss",
      queriesNotRun: "js/hardcoded-credentials",
    });
    assert.equal(exitCode, 0);
  });

  await it("returns -2 when an expected query did not run", () => {
    const sarif = buildSarifLog(["js/sql-injection"]);
    const exitCode = checkSarif(sarif, {
      sarifFile: "test.sarif",
      queriesRun: "js/sql-injection, js/xss",
      queriesNotRun: "",
    });
    assert.equal(exitCode, -2);
  });

  await it("returns -2 when an unexpected query ran", () => {
    const sarif = buildSarifLog(["js/sql-injection", "js/xss"]);
    const exitCode = checkSarif(sarif, {
      sarifFile: "test.sarif",
      queriesRun: "js/sql-injection",
      queriesNotRun: "js/xss",
    });
    assert.equal(exitCode, -2);
  });

  await it("handles empty queries-run and queries-not-run inputs", () => {
    const sarif = buildSarifLog(["js/sql-injection"]);
    const exitCode = checkSarif(sarif, {
      sarifFile: "test.sarif",
      queriesRun: "",
      queriesNotRun: "",
    });
    assert.equal(exitCode, 0);
  });

  await it("handles multiple extensions with rules", () => {
    const sarif: Log = {
      version: "2.1.0",
      $schema:
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
      runs: [
        {
          tool: {
            driver: { name: "CodeQL" },
            extensions: [
              {
                name: "pack-a",
                rules: [{ id: "js/sql-injection" }],
              },
              {
                name: "pack-b",
                rules: [{ id: "js/xss" }],
              },
            ],
          },
          results: [],
        },
      ],
    };
    const exitCode = checkSarif(sarif, {
      sarifFile: "test.sarif",
      queriesRun: "js/sql-injection, js/xss",
      queriesNotRun: "",
    });
    assert.equal(exitCode, 0);
  });

  await it("handles extensions with no rules", () => {
    const sarif: Log = {
      version: "2.1.0",
      $schema:
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
      runs: [
        {
          tool: {
            driver: { name: "CodeQL" },
            extensions: [
              { name: "empty-pack" },
              {
                name: "pack-with-rules",
                rules: [{ id: "js/xss" }],
              },
            ],
          },
          results: [],
        },
      ],
    };
    const exitCode = checkSarif(sarif, {
      sarifFile: "test.sarif",
      queriesRun: "js/xss",
      queriesNotRun: "js/sql-injection",
    });
    assert.equal(exitCode, 0);
  });

  await it("throws when tool extensions are undefined", () => {
    const sarif: Log = {
      version: "2.1.0",
      $schema:
        "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
      runs: [
        {
          tool: { driver: { name: "CodeQL" } },
          results: [],
        },
      ],
    };
    assert.throws(
      () =>
        checkSarif(sarif, {
          sarifFile: "test.sarif",
          queriesRun: "js/xss",
          queriesNotRun: "",
        }),
      { message: /Couldn't find tool extensions/ },
    );
  });
});
