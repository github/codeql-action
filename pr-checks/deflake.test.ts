#!/usr/bin/env npx tsx

/*
Tests for `deflake.ts`.
*/

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import { escapeWorkflowName, setWorkflowRunWorkflows } from "./deflake";

describe("escapeWorkflowName", async () => {
  await it("escapes the characters that filter patterns treat as glob syntax", () => {
    assert.equal(
      escapeWorkflowName(
        String.raw`!Name with C/C++, [a-z]?, *, ! and \ in it`,
      ),
      String.raw`\!Name with C/C\+\+, \[a-z]\?, \*, \! and \\ in it`,
    );
  });

  await it("leaves names without glob syntax unchanged", () => {
    const name = "PR Check - Upload-sarif: 'ref' and `sha` (Linux) ]";
    assert.equal(escapeWorkflowName(name), name);
  });
});

describe("setWorkflowRunWorkflows", async () => {
  await it("replaces the list with sorted, escaped names and leaves the rest of the workflow unchanged", () => {
    const workflow = `on:
  workflow_run:
    types: [completed]
    # A comment about the list.
    workflows:
      - Existing workflow
      # A comment within the list.
      - "Removed workflow"

jobs:
  rerun:
    if: |-
      github.event.workflow_run.conclusion == 'failure' &&
      github.event.workflow_run.run_attempt == 1
`;
    assert.equal(
      setWorkflowRunWorkflows(workflow, [
        "PR Check - b",
        "PR Check - C/C++",
        "Existing workflow",
        "PR Check - a",
      ]),
      String.raw`on:
  workflow_run:
    types: [completed]
    # A comment about the list.
    workflows:
      - "Existing workflow"
      - "PR Check - a"
      - "PR Check - b"
      - "PR Check - C/C\\+\\+"

jobs:
  rerun:
    if: |-
      github.event.workflow_run.conclusion == 'failure' &&
      github.event.workflow_run.run_attempt == 1
`,
    );
  });

  await it("uses single quotes only for patterns that contain double quotes and no backslashes", () => {
    // These are the quotes that Prettier uses when formatting these strings.
    assert.equal(
      setWorkflowRunWorkflows(
        "on:\n  workflow_run:\n    workflows:\n      - Old\n",
        ['Upload "quoted" SARIF', `It's "quoted"`, 'C++ "quoted"'],
      ),
      String.raw`on:
  workflow_run:
    workflows:
      - "C\\+\\+ \"quoted\""
      - 'It''s "quoted"'
      - 'Upload "quoted" SARIF'
`,
    );
  });

  await it("leaves comments and keys after the last item unchanged", () => {
    const after = `      # A comment after the list.

    branches: [main]
`;
    assert.equal(
      setWorkflowRunWorkflows(
        `on:\n  workflow_run:\n    workflows:\n      - Old\n${after}`,
        ["New"],
      ),
      `on:\n  workflow_run:\n    workflows:\n      - "New"\n${after}`,
    );
  });

  await it("returns an up-to-date workflow unchanged", () => {
    const workflow = String.raw`on:
  workflow_run:
    workflows:
      - "C/C\\+\\+"
      - "Other"
`;
    assert.equal(
      setWorkflowRunWorkflows(workflow, ["Other", "C/C++"]),
      workflow,
    );
  });

  await it("writes a flow sequence as a block sequence", () => {
    assert.equal(
      setWorkflowRunWorkflows("on:\n  workflow_run:\n    workflows: [Old]\n", [
        "New",
      ]),
      'on:\n  workflow_run:\n    workflows:\n      - "New"\n',
    );
  });

  await it("throws if the workflow isn't valid YAML", () => {
    // Duplicate keys are an error in the `yaml` library, though Prettier accepts them.
    assert.throws(
      () =>
        setWorkflowRunWorkflows(
          "on:\n  workflow_run:\n    workflows:\n      - Old\njobs: {}\njobs: {}\n",
          ["New"],
        ),
      /Failed to parse the workflow: .* at line 6, column 1/,
    );
  });

  await it("throws if the workflow has no workflow_run trigger", () => {
    assert.throws(
      () => setWorkflowRunWorkflows("on:\n  push: {}\n", ["Other"]),
      /Expected `on.workflow_run.workflows` to be a sequence/,
    );
  });
});
