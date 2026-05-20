#!/usr/bin/env npx tsx

/*
Tests for check-repo-size.ts.
*/

import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  COMMENT_MARKER,
  DEFAULT_BASE_REF,
  buildCommentBody,
  formatBytes,
  formatPercent,
  isDeltaSignificant,
  measureArchiveSize,
  readArgs,
} from "./check-repo-size";

describe("formatBytes", async () => {
  const cases: Array<[number, boolean, string]> = [
    // Unsigned values, including sub-KiB amounts which round to 0.00.
    [0, false, "0.00 KiB"],
    [512, false, "0.50 KiB"],
    [1024, false, "1.00 KiB"],
    [1024 * 1024, false, "1024.00 KiB"],
    [2 * 1024 * 1024, false, "2048.00 KiB"],
    // Negative values always use a leading minus.
    [-2 * 1024 * 1024, false, "-2048.00 KiB"],
    // signed=true prepends a + to non-negative values.
    [0, true, "+0.00 KiB"],
    [2 * 1024 * 1024, true, "+2048.00 KiB"],
    [-2 * 1024 * 1024, true, "-2048.00 KiB"],
  ];
  for (const [bytes, signed, expected] of cases) {
    await it(`formats ${bytes} (signed=${signed}) as ${expected}`, () => {
      assert.equal(formatBytes(bytes, signed), expected);
    });
  }
});

describe("formatPercent", async () => {
  await it("formats positive fractions with a leading +", () => {
    assert.equal(formatPercent(0.1), "+10.00%");
    assert.equal(formatPercent(0.0123), "+1.23%");
  });

  await it("formats negative fractions with a leading -", () => {
    assert.equal(formatPercent(-0.1), "-10.00%");
  });

  await it("formats zero without a sign", () => {
    assert.equal(formatPercent(0), "0.00%");
  });
});

describe("isDeltaSignificant", async () => {
  const cases: Array<[number, number, number, boolean]> = [
    // At and above threshold (both signs).
    [100, 1000, 0.1, true],
    [101, 1000, 0.1, true],
    [-100, 1000, 0.1, true],
    // Below threshold (both signs, plus exact zero).
    [99, 1000, 0.1, false],
    [-99, 1000, 0.1, false],
    [0, 1000, 0.1, false],
  ];
  for (const [delta, base, fraction, expected] of cases) {
    await it(`returns ${expected} for delta=${delta}, base=${base}, fraction=${fraction}`, () => {
      assert.equal(isDeltaSignificant(delta, base, fraction), expected);
    });
  }
});

describe("buildCommentBody", async () => {
  await it("includes the marker, the base/PR/delta rows, and the run URL", () => {
    const body = buildCommentBody({
      baseRef: "main",
      baseSize: 2_000_000,
      prSize: 2_300_000,
      runUrl: "https://example.test/run",
    });

    assert.match(body, new RegExp(`^${escapeRegExp(COMMENT_MARKER)}`));
    assert.match(body, /Base \(`main`\) \| 1953\.13 KiB \(2000000 bytes\)/);
    assert.match(body, /This PR \| 2246\.09 KiB \(2300000 bytes\)/);
    assert.match(
      body,
      /\*\*Delta\*\* \| \*\*\+292\.97 KiB \(\+300000 bytes, \+15\.00%\)\*\*/,
    );
    assert.match(body, /\[workflow run\]\(https:\/\/example\.test\/run\)/);
  });

  await it("formats negative deltas with a leading minus and omits the run URL when missing", () => {
    const body = buildCommentBody({
      baseRef: "main",
      baseSize: 2_000_000,
      prSize: 1_800_000,
    });
    assert.match(
      body,
      /\*\*Delta\*\* \| \*\*-195\.31 KiB \(-200000 bytes, -10\.00%\)\*\*/,
    );
    assert.doesNotMatch(body, /workflow run/);
  });
});

describe("readArgs", async () => {
  await it("defaults the base ref and head commit for local runs", () => {
    const originalEnv = process.env;
    const originalArgv = process.argv;

    try {
      process.env = {};
      process.argv = ["node", "check-repo-size.ts", "--output-dir", "/tmp/out"];

      const args = readArgs();

      assert.equal(args.baseRef, DEFAULT_BASE_REF);
      assert.equal(args.baseCommitish, `origin/${DEFAULT_BASE_REF}`);
      assert.equal(args.headCommitish, "HEAD");
      assert.equal(args.outputDir, "/tmp/out");
      assert.equal(args.runUrl, undefined);
    } finally {
      process.env = originalEnv;
      process.argv = originalArgv;
    }
  });

  await it("uses the base and head SHAs when provided by the workflow", () => {
    const originalEnv = process.env;
    const originalArgv = process.argv;

    try {
      process.env = {
        BASE_REF: "main",
        BASE_SHA: "abc123",
        HEAD_SHA: "def456",
        RUN_URL: "https://example.test/run",
      };
      process.argv = ["node", "check-repo-size.ts", "--output-dir", "/tmp/out"];

      const args = readArgs();

      assert.equal(args.baseRef, "main");
      assert.equal(args.baseCommitish, "abc123");
      assert.equal(args.headCommitish, "def456");
      assert.equal(args.outputDir, "/tmp/out");
      assert.equal(args.runUrl, "https://example.test/run");
    } finally {
      process.env = originalEnv;
      process.argv = originalArgv;
    }
  });

  await it("throws when --output-dir is missing", () => {
    const originalEnv = process.env;
    const originalArgv = process.argv;

    try {
      process.env = {};
      process.argv = ["node", "check-repo-size.ts"];
      assert.throws(() => readArgs(), /--output-dir is required/);
    } finally {
      process.env = originalEnv;
      process.argv = originalArgv;
    }
  });
});

let repoDir: string;

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-repo-size-test-"));
  execFileSync("git", ["init", "--initial-branch=main", "-q"], {
    cwd: repoDir,
  });
  execFileSync("git", ["config", "user.email", "test@example.test"], {
    cwd: repoDir,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: repoDir });
});

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

function commit(name: string, content: string, message: string) {
  fs.writeFileSync(path.join(repoDir, name), content);
  execFileSync("git", ["add", name], { cwd: repoDir });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: repoDir });
}

describe("measureArchiveSize", async () => {
  await it("returns a positive byte count for a non-empty repo", async () => {
    commit("a.txt", "hello world\n", "first");
    const size = await measureArchiveSize("HEAD", repoDir);
    assert.ok(size > 0, `expected size > 0, got ${size}`);
  });

  await it("returns the same size on repeated runs (deterministic)", async () => {
    commit("a.txt", "hello world\n", "first");
    const a = await measureArchiveSize("HEAD", repoDir);
    const b = await measureArchiveSize("HEAD", repoDir);
    assert.equal(a, b);
  });

  await it("returns a larger size when more content is added", async () => {
    commit("a.txt", "hello world\n", "first");
    const small = await measureArchiveSize("HEAD", repoDir);

    // Use random bytes so the new content is incompressible and the archive
    // is guaranteed to grow even after gzip.
    commit("b.bin", randomBytes(8192).toString("base64"), "second");
    const big = await measureArchiveSize("HEAD", repoDir);
    assert.ok(
      big > small,
      `expected ${big} > ${small} after adding more content`,
    );
  });

  await it("ignores untracked files (e.g. node_modules)", async () => {
    commit("a.txt", "hello\n", "first");
    commit(".gitignore", "node_modules/\n", "ignore node_modules");
    const sizeBefore = await measureArchiveSize("HEAD", repoDir);

    fs.mkdirSync(path.join(repoDir, "node_modules"));
    fs.writeFileSync(
      path.join(repoDir, "node_modules", "huge.bin"),
      "x".repeat(1_000_000),
    );

    const sizeAfter = await measureArchiveSize("HEAD", repoDir);
    assert.equal(
      sizeAfter,
      sizeBefore,
      "untracked node_modules should not affect the archive size",
    );
  });

  await it("rejects when the ref does not exist", async () => {
    commit("a.txt", "hello\n", "first");
    await assert.rejects(
      () => measureArchiveSize("does-not-exist", repoDir),
      /git archive does-not-exist exited with code/,
    );
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
