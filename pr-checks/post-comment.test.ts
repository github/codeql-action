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
  "--action",
  "insert",
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
      action: "insert",
      issueId: 42,
      repository: { owner: "github", repo: "codeql-action" },
    });
  });

  await it("parses a delete action without a body", () => {
    const options = parseOptions([
      ...withoutFlag("--body"),
      "--action",
      "delete",
    ]);
    assert.equal(options.action, "delete");
    assert.equal(options.body, "");
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

  await it("rejects a whitespace-only --marker", () => {
    assert.throws(
      () => parseOptions(withFlag("--marker", " \t\n")),
      /Missing required flag --marker/,
    );
  });

  await it("rejects unknown flags using parseArgs", () => {
    assert.throws(() => parseOptions([...validFlags, "--unknown", "value"]), {
      code: "ERR_PARSE_ARGS_UNKNOWN_OPTION",
    });
  });

  await it("rejects flags without a value using parseArgs", () => {
    assert.throws(() => parseOptions([...validFlags, "--body"]), {
      code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE",
    });
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
  action: "insert",
  issueId: 42,
  repository: { owner: "owner", repo: "repo" },
};

describe("performAction", async () => {
  for (const action of ["upsert", "delete"] as const) {
    await it(`uses the supplied marker for '${action}' without affecting other comments`, async () => {
      const marker = "<!-- custom-warning -->";
      const { client, calls } = fakeClient([
        { id: 1, body: "<!-- marker -->\nunrelated warning" },
        { id: 2, body: `${marker}\nold warning` },
      ]);
      const options = parseOptions(withFlag("--marker", marker));
      await performAction(client, action, options);
      assert.deepEqual(calls, {
        createComment: [],
        updateComment:
          action === "upsert"
            ? [
                {
                  ...options.repository,
                  comment_id: 2,
                  body: `${marker}\nhello`,
                },
              ]
            : [],
        deleteComment:
          action === "delete" ? [{ ...options.repository, comment_id: 2 }] : [],
      });
    });
  }

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
    const options = parseOptions([
      ...withoutFlag("--body"),
      "--action",
      "delete",
    ]);
    await performAction(client, options.action, options);
    assert.deepEqual(calls.deleteComment, [
      { owner: "github", repo: "codeql-action", comment_id: 9 },
    ]);
  });
});
