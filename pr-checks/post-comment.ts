#!/usr/bin/env npx tsx

/*
Generic CLI for creating or updating a "sticky" PR comment identified by a hidden
HTML-comment marker. This centralizes the gh api logic previously duplicated across PR-check
workflow steps that each managed their own marked comment (e.g. a CHANGELOG.md modification
warning).

The marker is passed explicitly via `--marker` and can be any non-empty string, though an
HTML comment (e.g. `<!-- my-bot -->`) is recommended so it doesn't render visibly. It is used
both to find a pre-existing comment on the pull request to update, and is automatically prepended to
`--body` when posting or updating a comment so that future invocations can find it again.
The `.github/actions/post-comment` action requires callers to supply this value via its
`marker` input.
*/

import assert from "node:assert/strict";
import { parseArgs } from "node:util";

import { RepositoryNwo } from "../src/repository";

import { type ApiClient, getApiClient, resolveToken } from "./api-client";

/** Represents the command-line options. */
export interface Options {
  /** The full comment body. */
  body: string;
  /** The hidden HTML-comment marker used to find a pre-existing comment. */
  marker: string;
  /** The issue/pull request number to post/update the comment on. */
  issueId: number;
  /** The repository to operate on. */
  repository: RepositoryNwo;
}

/** Parses CLI arguments supplied by the composite action into `Options`. */
export function parseOptions(argv?: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      body: { type: "string" },
      marker: { type: "string" },
      "issue-id": { type: "string" },
      repository: { type: "string" },
    },
    strict: true,
  });

  assert(values.marker !== undefined, "Missing required flag --marker.");
  assert(
    values.marker.trim() !== "",
    "The value for --marker cannot be empty.",
  );
  const [owner, repo] = values.repository!.split("/");

  return {
    body: values.body!,
    marker: values.marker,
    issueId: Number(values["issue-id"]),
    repository: { owner, repo },
  };
}

/**
 * Finds the first comment on the given issue/pull request whose body starts with `marker`, if any.
 */
export async function findExistingComment(
  client: ApiClient,
  repository: RepositoryNwo,
  issueNumber: number,
  marker: string,
): Promise<number | undefined> {
  const comments = await client.paginate(client.rest.issues.listComments, {
    ...repository,
    issue_number: issueNumber,
    per_page: 100,
  });
  const markedComments = comments.filter((comment) =>
    comment.body?.startsWith(marker),
  );
  if (markedComments.length > 1) {
    console.warn(
      `Found ${markedComments.length} comments with marker "${marker}". ` +
        "Updating the first one and leaving the others unchanged." +
        "Use a unique marker for each distinct managed comment to avoid this situation.",
    );
  }
  return markedComments[0]?.id;
}

/**
 * Creates or updates a marked comment using `client` to talk to the GitHub API.
 */
export async function setComment(
  client: ApiClient,
  options: Options,
): Promise<void> {
  const { issueId, marker, repository } = options;
  const body = `${marker}\n${options.body}`;

  const existingCommentId = await findExistingComment(
    client,
    repository,
    issueId,
    marker,
  );
  if (existingCommentId === undefined) {
    console.info("No existing comment found; creating a new comment.");
    await client.rest.issues.createComment({
      ...repository,
      issue_number: issueId,
      body,
    });
  } else {
    console.info(`Updating existing comment ${existingCommentId}.`);
    await client.rest.issues.updateComment({
      ...repository,
      comment_id: existingCommentId,
      body,
    });
  }
}

async function main(): Promise<number> {
  const options = parseOptions();

  const token = resolveToken(process.env);
  const client = getApiClient(token);

  await setComment(client, options);

  return 0;
}

async function run(): Promise<void> {
  try {
    process.exit(await main());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  void run();
}
