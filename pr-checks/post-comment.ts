#!/usr/bin/env npx tsx

/*
Generic CLI for creating, updating, or deleting a "sticky" PR comment identified by a hidden
HTML-comment marker. This centralizes the gh api logic previously duplicated across PR-check
workflow steps that each managed their own marked comment (e.g. a CHANGELOG.md modification
warning).

The marker is passed explicitly via `--marker` and can be any non-empty string, though an
HTML comment (e.g. `<!-- my-bot -->`) is recommended so it doesn't render visibly. It is used
both to find a pre-existing comment on the pull request so that
`upsert`/`delete` actions know which comment to operate on, and is automatically prepended to
`--body` when posting or updating a comment so that future invocations can find it again. Callers
typically derive this value automatically (see `.github/actions/post-comment`) rather than
hand-authoring it.
*/

import { parseArgs } from "node:util";

import { type ApiClient, getApiClient } from "./api-client";

/** The set of valid actions that can be performed against a (possibly pre-existing) marked comment. */
export const ACTIONS = ["none", "insert", "upsert", "delete"] as const;
/** An action to perform against a (possibly pre-existing) marked comment. */
export type Action = (typeof ACTIONS)[number];

/** Represents the command-line options. */
export interface Options {
  /** The full comment body. */
  body: string;
  /** The hidden HTML-comment marker used to find a pre-existing comment. */
  marker: string;
  /** The condition that selects which action to perform. */
  actionCondition: boolean;
  /** The action to perform when `actionCondition` is `true`. */
  actionIfTrue: Action;
  /** The action to perform when `actionCondition` is `false`. */
  actionIfFalse: Action;
  /** The issue/pull request number to post/update/delete the comment on. */
  issueId: number;
  /** The repository to operate on. */
  repository: { owner: string; repo: string };
}

/**
 * Validates and parses a required CLI flag's raw string `value`, delegating the actual
 * value-specific validation/conversion to `parse`.
 */
function parseFlag<T>(
  flag: string,
  value: string | undefined,
  parse: (value: string) => T,
): T {
  if (value === undefined) {
    throw new Error(`Missing required flag --${flag}.`);
  }
  try {
    return parse(value);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid value '${value}' for --${flag}. ${reason}`);
  }
}

/** Parses and validates `value` as an `Action`. */
function parseAction(flag: string, value: string | undefined): Action {
  return parseFlag(flag, value, (raw) => {
    if (!(ACTIONS as readonly string[]).includes(raw)) {
      throw new Error(`Must be one of: ${ACTIONS.join(", ")}.`);
    }
    return raw as Action;
  });
}

/** Parses and validates `value` as a boolean. */
function parseBoolean(flag: string, value: string | undefined): boolean {
  return parseFlag(flag, value, (raw) => {
    if (raw !== "true" && raw !== "false") {
      throw new Error("Must be 'true' or 'false'.");
    }
    return raw === "true";
  });
}

/** Parses and validates `value` as an issue/pull request number. */
function parseIssueId(value: string | undefined): number {
  return parseFlag("issue-id", value, (raw) => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("Must be a positive integer.");
    }
    return parsed;
  });
}

/** Parses and validates `value` as an `owner/repo` repository reference. */
function parseRepository(value: string | undefined): {
  owner: string;
  repo: string;
} {
  return parseFlag("repository", value, (raw) => {
    const [owner, repo, ...rest] = raw.split("/");
    if (!owner || !repo || rest.length > 0) {
      throw new Error("Must be in the form 'owner/repo'.");
    }
    return { owner, repo };
  });
}

/** Parses the command-line arguments into `Options`. */
export function parseOptions(argv?: string[]): Options {
  const { values } = parseArgs({
    args: argv,
    options: {
      body: { type: "string" },
      marker: { type: "string" },
      "action-condition": { type: "string" },
      "action-if-true": { type: "string" },
      "action-if-false": { type: "string" },
      "issue-id": { type: "string" },
      repository: { type: "string" },
    },
    strict: true,
  });

  if (values.body === undefined) {
    throw new Error("Missing required flag --body.");
  }
  if (values.marker === undefined || values.marker.trim() === "") {
    throw new Error("Missing required flag --marker.");
  }

  return {
    body: values.body,
    marker: values.marker,
    actionCondition: parseBoolean(
      "action-condition",
      values["action-condition"],
    ),
    actionIfTrue: parseAction("action-if-true", values["action-if-true"]),
    actionIfFalse: parseAction("action-if-false", values["action-if-false"]),
    issueId: parseIssueId(values["issue-id"]),
    repository: parseRepository(values.repository),
  };
}

/** Resolves the GitHub API token to use, from `GH_TOKEN` or `GITHUB_TOKEN`. */
export function resolveToken(env: NodeJS.ProcessEnv): string {
  const token = env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Missing authentication token. Set GH_TOKEN or GITHUB_TOKEN.",
    );
  }
  return token;
}

/**
 * Finds the first comment on the given issue/pull request whose body starts with `marker`, if any.
 */
export async function findExistingComment(
  client: ApiClient,
  repository: { owner: string; repo: string },
  issueNumber: number,
  marker: string,
): Promise<number | undefined> {
  const comments = await client.paginate(client.rest.issues.listComments, {
    ...repository,
    issue_number: issueNumber,
    per_page: 100,
  });
  return comments.find((comment) => comment.body?.startsWith(marker))?.id;
}

/**
 * Performs the resolved `action` against a (possibly pre-existing) marked comment, using
 * `client` to talk to the GitHub API. This is the core dispatch logic of this script, extracted
 * from `main` so it can be unit-tested with an injected (fake) `client`.
 */
export async function performAction(
  client: ApiClient,
  action: Action,
  options: Options,
): Promise<void> {
  const { issueId, marker, repository } = options;
  const body = `${marker}\n${options.body}`;

  let existingCommentId: number | undefined;
  if (action === "upsert" || action === "delete") {
    existingCommentId = await findExistingComment(
      client,
      repository,
      issueId,
      marker,
    );
  }

  switch (action) {
    case "none":
      console.info("No action needed.");
      break;
    case "insert":
      console.info("Creating a new comment.");
      await client.rest.issues.createComment({
        ...repository,
        issue_number: issueId,
        body,
      });
      break;
    case "upsert":
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
      break;
    case "delete":
      if (existingCommentId === undefined) {
        console.info("No existing comment found to delete; skipping.");
      } else {
        console.info(`Deleting existing comment ${existingCommentId}.`);
        await client.rest.issues.deleteComment({
          ...repository,
          comment_id: existingCommentId,
        });
      }
      break;
  }
}

async function main(): Promise<number> {
  const options = parseOptions();
  const action = options.actionCondition
    ? options.actionIfTrue
    : options.actionIfFalse;
  console.info(`Resolved action: ${action}`);

  const token = resolveToken(process.env);
  const client = getApiClient(token);

  await performAction(client, action, options);

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
