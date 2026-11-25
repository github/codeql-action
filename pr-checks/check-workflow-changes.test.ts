#!/usr/bin/env npx tsx

/*
Tests for `check-workflow-changes.ts`.
*/

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findDisallowedChanges } from "./check-workflow-changes";

const WORKFLOW = `name: Test
on:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - run: echo test
`;

describe("findDisallowedChanges", async () => {
  await it("allows changes to a workflow's jobs and comments", () => {
    assert.deepEqual(
      findDisallowedChanges([
        {
          kind: "modified",
          path: "a.yml",
          before: WORKFLOW,
          after: `# A comment\n${WORKFLOW.replace("ubuntu-24.04", "ubuntu-26.04")}`,
        },
      ]),
      [],
    );
  });

  await it("reports changes to a workflow's triggers", () => {
    assert.deepEqual(
      findDisallowedChanges([
        {
          kind: "modified",
          path: "a.yml",
          before: WORKFLOW,
          after: WORKFLOW.replace("pull_request:", "push:"),
        },
      ]),
      ["The changes to 'a.yml' affect more than the workflow's jobs."],
    );
  });

  await it("reports added and deleted files", () => {
    assert.deepEqual(
      findDisallowedChanges([
        { kind: "other", path: "a.yml", status: "A" },
        { kind: "other", path: "b.yml", status: "D" },
      ]),
      [
        "The changes add, delete or replace 'a.yml' (git status 'A'), but they can only modify the jobs of existing workflows.",
        "The changes add, delete or replace 'b.yml' (git status 'D'), but they can only modify the jobs of existing workflows.",
      ],
    );
  });

  await it("reports workflows that aren't valid YAML after the changes", () => {
    const problems = findDisallowedChanges([
      { kind: "modified", path: "a.yml", before: WORKFLOW, after: "on: [" },
    ]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^'a\.yml' isn't valid YAML after the changes: /);
  });
});
