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
  resolveToken,
  setComment,
} from "./post-comment";

/** A baseline set of valid CLI flags, as an array, for use in parseOptions tests. */
const validFlags = [
  "--body",
  "hello",
  "--marker",
  "<!-- marker -->",
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
      issueId: 42,
      repository: { owner: "github", repo: "codeql-action" },
    });
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
  const comments = existingComments.map((comment) => ({ ...comment }));
  let nextId =
    comments.reduce((maxId, comment) => Math.max(maxId, comment.id), 0) + 1;

  const client = {
    paginate: async () => comments,
    rest: {
      issues: {
        listComments: () => {},
        createComment: async ({ body }: { body: string }) => {
          comments.push({ id: nextId++, body });
        },
        updateComment: async ({
          comment_id,
          body,
        }: {
          comment_id: number;
          body: string;
        }) => {
          const comment = comments.find(({ id }) => id === comment_id);
          assert.ok(comment, `Comment ${comment_id} does not exist.`);
          comment.body = body;
        },
      },
    },
  };

  return { client: client as unknown as ApiClient, comments };
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

/** A baseline set of `Options`, for use in `setComment` tests. */
const baseOptions: Options = {
  body: "hello",
  marker: "<!-- marker -->",
  issueId: 42,
  repository: { owner: "owner", repo: "repo" },
};

function assertCommentContent(
  comment: { body?: string },
  marker: string,
  body: string,
): void {
  assert.ok(comment.body?.startsWith(marker));
  assert.ok(comment.body?.endsWith(body));
}

describe("setComment", async () => {
  await it("uses the supplied marker without affecting other comments", async () => {
    const marker = "<!-- custom-warning -->";
    const { client, comments } = fakeClient([
      { id: 1, body: `${baseOptions.marker}\nunrelated warning` },
      { id: 2, body: `${marker}\nold warning` },
    ]);
    const options = parseOptions(withFlag("--marker", marker));

    await setComment(client, options);

    // Only the comment with the supplied marker changes.
    assert.equal(comments.length, 2);
    assert.deepEqual(comments[0], {
      id: 1,
      body: `${baseOptions.marker}\nunrelated warning`,
    });
    assert.equal(comments[1].id, 2);
    assertCommentContent(comments[1], marker, options.body);
  });

  await it("creates a new comment with the marker prepended", async () => {
    const { client, comments } = fakeClient([]);
    // No comment has the marker before posting.
    assert.equal(comments.length, 0);
    assert.ok(
      !comments.some(({ body }) => body?.startsWith(baseOptions.marker)),
    );

    await setComment(client, baseOptions);

    // Posting adds exactly one comment with the marker before the body.
    assert.equal(comments.length, 1);
    assertCommentContent(comments[0], baseOptions.marker, baseOptions.body);
  });

  await it("creates a new comment when no existing comment matches", async () => {
    const originalComments = [
      { id: 7, body: "unrelated" },
      { id: 2, body: "another unrelated comment" },
    ];
    const { client, comments } = fakeClient(originalComments);
    // Existing comments do not match the marker.
    assert.ok(
      !comments.some(({ body }) => body?.startsWith(baseOptions.marker)),
    );

    await setComment(client, baseOptions);

    // A new comment is added without changing unrelated comments.
    assert.equal(comments.length, originalComments.length + 1);
    assert.deepEqual(
      comments.slice(0, originalComments.length),
      originalComments,
    );
    const markedComments = comments.filter(({ body }) =>
      body?.startsWith(baseOptions.marker),
    );
    // Exactly one comment contains the expected marker and body.
    assert.equal(markedComments.length, 1);
    assertCommentContent(
      markedComments[0],
      baseOptions.marker,
      baseOptions.body,
    );
    // The new comment's ID does not collide with existing IDs.
    assert.equal(new Set(comments.map(({ id }) => id)).size, comments.length);
  });

  await it("updates the existing comment when one is found", async () => {
    const { client, comments } = fakeClient([
      { id: 7, body: `${baseOptions.marker}\nold` },
    ]);

    await setComment(client, baseOptions);

    // Updating preserves the comment's ID without creating a duplicate.
    assert.equal(comments.length, 1);
    assert.equal(comments[0].id, 7);
    assertCommentContent(comments[0], baseOptions.marker, baseOptions.body);
  });

  await it("replaces a warning with the resolved state using the same marker", async () => {
    const { client, comments } = fakeClient([
      { id: 9, body: `${baseOptions.marker}\nold` },
    ]);
    const body =
      "`CHANGELOG.md` is not modified in this PR. No changelog action is needed.";

    await setComment(client, { ...baseOptions, body });

    // The resolved state replaces the warning on the same marked comment.
    assert.equal(comments.length, 1);
    assert.equal(comments[0].id, 9);
    assertCommentContent(comments[0], baseOptions.marker, body);
  });
});
