#!/usr/bin/env npx tsx

/*
Creates or updates a pull request comment identified by a marker. The marker
is supplied via `--marker` (or the `.github/actions/post-comment` action's `marker` input)
and must be non-empty. Supply a plain-text identifier; the CLI wraps it in a
hidden HTML comment, prepends it to `--body`, and uses it to find the comment on later runs.
Supply `--update-only` to suppress creation; omit it to update or create comments.

Example:
```sh
GH_TOKEN=<token> npx tsx ./pr-checks/post-comment.ts \
  --body "The changelog needs updating." \
  --marker "my-bot" \
  --issue-id 123 \
  --repository github/codeql-action
```
*/

import assert from "node:assert/strict";
import { parseArgs } from "node:util";

import { parseRepositoryNwo, type RepositoryNwo } from "../src/repository";

import { type ApiClient, getApiClient, resolveToken } from "./api-client";

/** Represents the command-line options. */
export interface Options {
  /** The full comment body. */
  body: string;
  /** Plain-text identifier wrapped in a hidden HTML comment. */
  marker: string;
  /** Whether to only update a comment if a matching marker exists. */
  updateOnly: boolean;
  /** The issue/pull request number to post/update the comment on. */
  issueId: number;
  /** The repository to operate on. */
  repository: RepositoryNwo;
}

function hiddenMarker(marker: string): string {
  return `<!-- ${marker} -->`;
}

/** Parses CLI arguments supplied by the composite action into `Options`. */
export function parseOptions(argv?: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      body: { type: "string" },
      marker: { type: "string" },
      "update-only": { type: "boolean", default: false },
      "issue-id": { type: "string" },
      repository: { type: "string" },
    },
    strict: true,
  });

  assert(values.body !== undefined, "Missing required flag --body.");
  assert(values.body.trim() !== "", "The value for --body cannot be empty.");
  assert(values.marker !== undefined, "Missing required flag --marker.");
  assert(
    values.marker.trim() !== "",
    "The value for --marker cannot be empty.",
  );
  assert(
    values.repository !== undefined,
    "Missing required flag --repository.",
  );
  assert(
    values.repository.trim() !== "",
    "The value for --repository cannot be empty.",
  );
  assert(
    /^[\w.-]+\/[\w.-]+$/.test(values.repository),
    "Invalid --repository value.",
  );

  return {
    body: values.body,
    marker: values.marker,
    updateOnly: values["update-only"],
    issueId: Number(values["issue-id"]),
    repository: parseRepositoryNwo(values.repository),
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
  const formattedMarker = hiddenMarker(marker);
  const comments = await client.paginate(client.rest.issues.listComments, {
    ...repository,
    issue_number: issueNumber,
    per_page: 100,
  });
  const markedComments = comments.filter((comment) =>
    comment.body?.startsWith(formattedMarker),
  );
  if (markedComments.length > 1) {
    console.warn(
      `Found ${markedComments.length} comments with marker "${formattedMarker}". ` +
        "Updating the first one and leaving the others unchanged. " +
        "Use a unique marker for each distinct managed comment to avoid this situation.",
    );
  }
  return markedComments.at(-1)?.id;
}

/**
 * Creates or updates a marked comment using `client` to talk to the GitHub API.
 */
export async function setComment(
  client: ApiClient,
  options: Options,
): Promise<void> {
  const { issueId, marker, repository } = options;
  const body = `${hiddenMarker(marker)}\n${options.body}`;

  const existingCommentId = await findExistingComment(
    client,
    repository,
    issueId,
    marker,
  );
  if (existingCommentId === undefined) {
    if (options.updateOnly) {
      console.info(
        "No existing comment found; skipping creation because --update-only was specified.",
      );
      return;
    }
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
