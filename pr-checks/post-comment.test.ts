#!/usr/bin/env npx tsx

/*
Tests for post-comment.ts.
*/

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type ApiClient } from "./api-client";
import {
  findExistingComment,
  type Options,
  parseOptions,
  performAction,
  resolveToken,
} from "./post-comment";

/** A baseline set of valid CLI flags, as an array, for use in parseOptions tests. */
const validFlags = [
  "--body",
  "hello",
  "--marker",
  "<!-- marker -->",
  "--action-condition",
  "true",
  "--action-if-true",
  "insert",
  "--action-if-false",
  "delete",
  "--issue-id",
  "42",
  "--repository",
  "github/codeql-action",
];

/** Returns a copy of `validFlags` with the value following `flag` replaced by `value`. */
function withFlag(flag: string, value: string): string[] {
  const flags = [...validFlags];
  const index = flags.indexOf(flag);
  flags[index + 1] = value;
  return flags;
}

/** Returns a copy of `validFlags` with `flag` (and its value) removed entirely. */
function withoutFlag(flag: string): string[] {
  const flags = [...validFlags];
  const index = flags.indexOf(flag);
  flags.splice(index, 2);
  return flags;
}

describe("parseOptions", async () => {
  await it("parses valid flags", () => {
    const options = parseOptions(validFlags);
    assert.deepEqual(options, {
      body: "hello",
      marker: "<!-- marker -->",
      actionCondition: true,
      actionIfTrue: "insert",
      actionIfFalse: "delete",
      issueId: 42,
      repository: { owner: "github", repo: "codeql-action" },
    });
  });

  await it("parses action-condition=false", () => {
    const options = parseOptions(withFlag("--action-condition", "false"));
    assert.equal(options.actionCondition, false);
  });

  await it("rejects a missing --body", () => {
    assert.throws(
      () => parseOptions(withoutFlag("--body")),
      /Missing required flag --body/,
    );
  });

  await it("rejects a missing --marker", () => {
    assert.throws(
      () => parseOptions(withoutFlag("--marker")),
      /Missing required flag --marker/,
    );
  });

  await it("rejects an empty --marker", () => {
    assert.throws(
      () => parseOptions(withFlag("--marker", "")),
      /Missing required flag --marker/,
    );
  });

  await it("rejects an invalid --action-condition value", () => {
    assert.throws(
      () => parseOptions(withFlag("--action-condition", "yes")),
      /Invalid value 'yes' for --action-condition/,
    );
  });

  await it("rejects an invalid --action-if-true value", () => {
    assert.throws(
      () => parseOptions(withFlag("--action-if-true", "bogus")),
      /Invalid value 'bogus' for --action-if-true/,
    );
  });

  await it("rejects an invalid --action-if-false value", () => {
    assert.throws(
      () => parseOptions(withFlag("--action-if-false", "bogus")),
      /Invalid value 'bogus' for --action-if-false/,
    );
  });

  await it("rejects a missing --issue-id", () => {
    assert.throws(
      () => parseOptions(withoutFlag("--issue-id")),
      /Missing required flag --issue-id/,
    );
  });

  await it("rejects a non-numeric --issue-id", () => {
    assert.throws(
      () => parseOptions(withFlag("--issue-id", "not-a-number")),
      /Invalid value 'not-a-number' for --issue-id/,
    );
  });

  await it("rejects a missing --repository", () => {
    assert.throws(
      () => parseOptions(withoutFlag("--repository")),
      /Missing required flag --repository/,
    );
  });

  await it("rejects a --repository that isn't in the form 'owner/repo'", () => {
    assert.throws(
      () => parseOptions(withFlag("--repository", "not-a-slug")),
      /Invalid value 'not-a-slug' for --repository/,
    );
  });
});

describe("resolveToken", async () => {
  await it("reads the token from GH_TOKEN", () => {
    assert.equal(
      resolveToken({ GH_TOKEN: "gh-token", GITHUB_TOKEN: "gha-token" }),
      "gh-token",
    );
  });

  await it("falls back to GITHUB_TOKEN", () => {
    assert.equal(resolveToken({ GITHUB_TOKEN: "gha-token" }), "gha-token");
  });

  await it("throws when no token is set", () => {
    assert.throws(() => resolveToken({}), /Missing authentication token/);
  });
});

/** A minimal fake of the subset of `ApiClient` used by post-comment.ts. */
function fakeClient(existingComments: Array<{ id: number; body?: string }>) {
  const calls: {
    createComment: unknown[];
    updateComment: unknown[];
    deleteComment: unknown[];
  } = { createComment: [], updateComment: [], deleteComment: [] };

  const client = {
    paginate: async () => existingComments,
    rest: {
      issues: {
        listComments: () => {},
        createComment: async (params: unknown) => {
          calls.createComment.push(params);
        },
        updateComment: async (params: unknown) => {
          calls.updateComment.push(params);
        },
        deleteComment: async (params: unknown) => {
          calls.deleteComment.push(params);
        },
      },
    },
  };

  return { client: client as unknown as ApiClient, calls };
}

describe("findExistingComment", async () => {
  await it("finds the id of the first comment containing the marker", async () => {
    const { client } = fakeClient([
      { id: 1, body: "unrelated" },
      { id: 2, body: "<!-- marker -->\nhello" },
      { id: 3, body: "<!-- marker -->\nanother" },
    ]);
    const id = await findExistingComment(
      client,
      { owner: "owner", repo: "repo" },
      1,
      "<!-- marker -->",
    );
    assert.equal(id, 2);
  });

  await it("returns undefined when no comment matches", async () => {
    const { client } = fakeClient([{ id: 1, body: "unrelated" }]);
    const id = await findExistingComment(
      client,
      { owner: "owner", repo: "repo" },
      1,
      "<!-- marker -->",
    );
    assert.equal(id, undefined);
  });
});

/** A baseline set of `Options`, for use in `performAction` tests. */
const baseOptions: Options = {
  body: "hello",
  marker: "<!-- marker -->",
  actionCondition: true,
  actionIfTrue: "insert",
  actionIfFalse: "delete",
  issueId: 42,
  repository: { owner: "owner", repo: "repo" },
};

describe("performAction", async () => {
  await it("does nothing for 'none'", async () => {
    const { client, calls } = fakeClient([]);
    await performAction(client, "none", baseOptions);
    assert.deepEqual(calls, {
      createComment: [],
      updateComment: [],
      deleteComment: [],
    });
  });

  await it("creates a new comment for 'insert', with the marker prepended", async () => {
    const { client, calls } = fakeClient([]);
    await performAction(client, "insert", baseOptions);
    assert.deepEqual(calls.createComment, [
      {
        owner: "owner",
        repo: "repo",
        issue_number: 42,
        body: "<!-- marker -->\nhello",
      },
    ]);
    assert.deepEqual(calls.updateComment, []);
    assert.deepEqual(calls.deleteComment, []);
  });

  await it("creates a new comment for 'upsert' when no existing comment is found", async () => {
    const { client, calls } = fakeClient([{ id: 1, body: "unrelated" }]);
    await performAction(client, "upsert", baseOptions);
    assert.deepEqual(calls.createComment, [
      {
        owner: "owner",
        repo: "repo",
        issue_number: 42,
        body: "<!-- marker -->\nhello",
      },
    ]);
    assert.deepEqual(calls.updateComment, []);
  });

  await it("updates the existing comment for 'upsert' when one is found", async () => {
    const { client, calls } = fakeClient([
      { id: 7, body: "<!-- marker -->\nold" },
    ]);
    await performAction(client, "upsert", baseOptions);
    assert.deepEqual(calls.updateComment, [
      {
        owner: "owner",
        repo: "repo",
        comment_id: 7,
        body: "<!-- marker -->\nhello",
      },
    ]);
    assert.deepEqual(calls.createComment, []);
  });

  await it("does nothing for 'delete' when no existing comment is found", async () => {
    const { client, calls } = fakeClient([{ id: 1, body: "unrelated" }]);
    await performAction(client, "delete", baseOptions);
    assert.deepEqual(calls.deleteComment, []);
  });

  await it("deletes the existing comment for 'delete' when one is found", async () => {
    const { client, calls } = fakeClient([
      { id: 9, body: "<!-- marker -->\nold" },
    ]);
    await performAction(client, "delete", baseOptions);
    assert.deepEqual(calls.deleteComment, [
      { owner: "owner", repo: "repo", comment_id: 9 },
    ]);
  });
});
