import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { getOctokit } from "@actions/github";
import * as sinon from "sinon";

import {
  COMMENT_MARKER,
  buildCommentBody,
  formatBytes,
  formatPercent,
  isDeltaSignificant,
  measureArchiveSize,
  upsertSizeComment,
} from "./check-repo-size";

describe("formatBytes", async () => {
  const cases: Array<[number, boolean, string]> = [
    // Unsigned: bytes / KiB / MiB boundaries.
    [0, false, "0 B"],
    [1, false, "1 B"],
    [1023, false, "1023 B"],
    [1024, false, "1.00 KiB"],
    [2048, false, "2.00 KiB"],
    [1024 * 1024 - 1, false, "1024.00 KiB"],
    [1024 * 1024, false, "1.00 MiB"],
    [2.5 * 1024 * 1024, false, "2.50 MiB"],
    // Negative values always use a leading minus.
    [-512, false, "-512 B"],
    [-2048, false, "-2.00 KiB"],
    [-2 * 1024 * 1024, false, "-2.00 MiB"],
    // signed=true prepends a + to non-negative values.
    [0, true, "+0 B"],
    [512, true, "+512 B"],
    [2048, true, "+2.00 KiB"],
    [-512, true, "-512 B"],
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
    assert.match(body, /Base \(`main`\) \| 1\.91 MiB \(2000000 bytes\)/);
    assert.match(body, /This PR \| 2\.19 MiB \(2300000 bytes\)/);
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

describe("upsertSizeComment", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const prNumber = 42;

  let octokit: ReturnType<typeof getOctokit>;

  beforeEach(() => {
    octokit = getOctokit("test-token");
  });

  afterEach(() => {
    sinon.restore();
  });

  function stubExistingComments(comments: Array<{ id: number; body: string }>) {
    // upsertSizeComment calls `octokit.paginate(octokit.rest.issues.listComments, ...)`,
    // so stubbing `paginate` directly mocks the listing without depending on how
    // paginate walks Octokit's response (link headers etc.).
    return sinon.stub(octokit, "paginate").resolves(comments);
  }

  await it("creates a new comment when none exists and the delta is significant", async () => {
    stubExistingComments([]);
    const createStub = sinon
      .stub(octokit.rest.issues, "createComment")
      .resolves({ data: { id: 999 } } as never);

    const result = await upsertSizeComment({
      octokit,
      owner,
      repo,
      prNumber,
      body: `${COMMENT_MARKER}\nhello`,
      delta: 200,
      baseSize: 1000,
    });

    assert.deepEqual(result, { action: "created", commentId: 999 });
    sinon.assert.calledOnce(createStub);
    const createArgs = createStub.firstCall.args[0]!;
    assert.equal(createArgs.owner, owner);
    assert.equal(createArgs.repo, repo);
    assert.equal(createArgs.issue_number, prNumber);
    assert.ok(createArgs.body.includes(COMMENT_MARKER));
  });

  await it("creates a new comment for a significant size decrease", async () => {
    // Shrinkage matters too: it might indicate accidentally deleted tracked
    // files. The full pipeline (not just isDeltaSignificant) needs to post on
    // negative deltas.
    stubExistingComments([]);
    const createStub = sinon
      .stub(octokit.rest.issues, "createComment")
      .resolves({ data: { id: 999 } } as never);

    const result = await upsertSizeComment({
      octokit,
      owner,
      repo,
      prNumber,
      body: `${COMMENT_MARKER}\nhello`,
      delta: -200,
      baseSize: 1000,
    });

    assert.deepEqual(result, { action: "created", commentId: 999 });
    sinon.assert.calledOnce(createStub);
  });

  await it("skips when no existing comment and delta is below threshold", async () => {
    stubExistingComments([]);
    const createStub = sinon.stub(octokit.rest.issues, "createComment");
    const updateStub = sinon.stub(octokit.rest.issues, "updateComment");

    const result = await upsertSizeComment({
      octokit,
      owner,
      repo,
      prNumber,
      body: `${COMMENT_MARKER}\nhello`,
      delta: 50,
      baseSize: 1000,
    });

    assert.equal(result.action, "skipped");
    sinon.assert.notCalled(createStub);
    sinon.assert.notCalled(updateStub);
  });

  await it("updates the existing comment when the delta is significant", async () => {
    stubExistingComments([{ id: 7, body: `${COMMENT_MARKER}\nold body` }]);
    const updateStub = sinon
      .stub(octokit.rest.issues, "updateComment")
      .resolves({ data: { id: 7 } } as never);

    const result = await upsertSizeComment({
      octokit,
      owner,
      repo,
      prNumber,
      body: `${COMMENT_MARKER}\nnew body`,
      delta: 200,
      baseSize: 1000,
    });

    assert.deepEqual(result, { action: "updated", commentId: 7 });
    sinon.assert.calledOnce(updateStub);
    const updateArgs = updateStub.firstCall.args[0]!;
    assert.equal(updateArgs.comment_id, 7);
    assert.ok(updateArgs.body.includes("new body"));
  });

  await it("updates an existing comment even when the delta is below threshold", async () => {
    // This keeps the comment in sync after a PR that initially had a big diff
    // gets reduced below the threshold by a follow-up commit.
    stubExistingComments([{ id: 7, body: `${COMMENT_MARKER}\nold body` }]);
    const updateStub = sinon
      .stub(octokit.rest.issues, "updateComment")
      .resolves({ data: { id: 7 } } as never);

    const result = await upsertSizeComment({
      octokit,
      owner,
      repo,
      prNumber,
      body: `${COMMENT_MARKER}\nnew body`,
      delta: 1,
      baseSize: 1000,
    });

    assert.deepEqual(result, { action: "updated", commentId: 7 });
    sinon.assert.calledOnce(updateStub);
  });
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
