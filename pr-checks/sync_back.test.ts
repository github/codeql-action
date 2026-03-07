#!/usr/bin/env npx tsx

/*
Tests for the sync_back.ts script
*/

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  Options,
  scanGeneratedWorkflows,
  updateActionVersions,
  updateTemplateFiles,
} from "./sync_back";

let testDir: string;
let workflowDir: string;
let checksDir: string;
let actionVersionsTsPath: string;

const defaultOptions: Options = { verbose: false, force: false };

beforeEach(() => {
  /** Set up temporary directories and files for testing */
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-back-test-"));
  workflowDir = path.join(testDir, ".github", "workflows");
  checksDir = path.join(testDir, "pr-checks", "checks");
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.mkdirSync(checksDir, { recursive: true });

  // Create action-versions.ts file path
  actionVersionsTsPath = path.join(testDir, "pr-checks", "action-versions.ts");
});

afterEach(() => {
  /** Clean up temporary directories */
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("scanGeneratedWorkflows", () => {
  it("basic workflow scanning", () => {
    /** Test basic workflow scanning functionality */
    const workflowContent = `
name: Test Workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v5
      - uses: actions/setup-go@v6
`;

    fs.writeFileSync(path.join(workflowDir, "__test.yml"), workflowContent);

    const result = scanGeneratedWorkflows(workflowDir);

    assert.deepEqual(result["actions/checkout"], {
      version: "v4",
      comment: undefined,
    });
    assert.deepEqual(result["actions/setup-node"], {
      version: "v5",
      comment: undefined,
    });
    assert.deepEqual(result["actions/setup-go"], {
      version: "v6",
      comment: undefined,
    });
  });

  it("scanning workflows with version comments", () => {
    /** Test scanning workflows with version comments */
    const workflowContent = `
name: Test Workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@44511735964dcb71245e7e55f72539531f7bc0eb # v1.257.0
      - uses: actions/setup-python@v6 # Latest Python
`;

    fs.writeFileSync(path.join(workflowDir, "__test.yml"), workflowContent);

    const result = scanGeneratedWorkflows(workflowDir);

    assert.deepEqual(result["actions/checkout"], {
      version: "v4",
      comment: undefined,
    });
    assert.deepEqual(result["ruby/setup-ruby"], {
      version: "44511735964dcb71245e7e55f72539531f7bc0eb",
      comment: " v1.257.0",
    });
    assert.deepEqual(result["actions/setup-python"], {
      version: "v6",
      comment: " Latest Python",
    });
  });

  it("ignores local actions", () => {
    /** Test that local actions (starting with ./) are ignored */
    const workflowContent = `
name: Test Workflow
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/local-action
      - uses: ./another-local-action@v1
`;

    fs.writeFileSync(path.join(workflowDir, "__test.yml"), workflowContent);

    const result = scanGeneratedWorkflows(workflowDir);

    assert.deepEqual(result["actions/checkout"], {
      version: "v4",
      comment: undefined,
    });
    assert.equal("./.github/actions/local-action" in result, false);
    assert.equal("./another-local-action" in result, false);
  });
});

describe("updateActionVersions", () => {
  it("updates action-versions.ts file", () => {
    /** Test updating action-versions.ts file */
    const actionVersionsTsContent = `
export const ACTION_VERSIONS = {
  "actions/setup-node": {
    "version": "v4"
  },
  "actions/setup-go": {
    "version": "v5"
  }
};
`.trim();

    fs.writeFileSync(actionVersionsTsPath, actionVersionsTsContent);

    const actionVersions = {
      "actions/setup-node": { version: "v5" },
      "actions/setup-go": { version: "v6" },
    };

    const result = updateActionVersions(
      defaultOptions,
      actionVersionsTsPath,
      actionVersions,
    );
    assert.equal(result, true);

    const updatedContent = fs.readFileSync(actionVersionsTsPath, "utf8");

    assert.ok(
      updatedContent.includes('"actions/setup-node": {\n    "version": "v5"'),
    );
    assert.ok(
      updatedContent.includes('"actions/setup-go": {\n    "version": "v6"'),
    );
  });

  it("returns false when no changes are needed", () => {
    /** Test that updateActionVersions returns false when no changes are needed */
    const actionVersionsTsContent = `
export const ACTION_VERSIONS = {
  "actions/setup-node": {
    "version": "v5"
  }
};
`.trim();

    fs.writeFileSync(actionVersionsTsPath, actionVersionsTsContent);

    const actionVersions = {
      "actions/setup-node": { version: "v5" },
    };

    const result = updateActionVersions(
      defaultOptions,
      actionVersionsTsPath,
      actionVersions,
    );
    const updatedContent = fs.readFileSync(actionVersionsTsPath, "utf8");
    assert.equal(updatedContent, actionVersionsTsContent);
    assert.equal(result, false);
  });
});

describe("updateTemplateFiles", () => {
  it("updates template files", () => {
    /** Test updating template files */
    const templateContent = `
name: Test Template
steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-node@v4
    with:
      node-version: 16
`;

    const templatePath = path.join(checksDir, "test.yml");
    fs.writeFileSync(templatePath, templateContent);

    const actionVersions = {
      "actions/checkout": { version: "v4" },
      "actions/setup-node": { version: "v5", comment: " Latest" },
    };

    const result = updateTemplateFiles(
      defaultOptions,
      checksDir,
      actionVersions,
    );
    assert.equal(result.length, 1);
    assert.ok(result.includes(templatePath));

    const updatedContent = fs.readFileSync(templatePath, "utf8");

    assert.ok(updatedContent.includes("uses: actions/checkout@v4"));
    assert.ok(updatedContent.includes("uses: actions/setup-node@v5 # Latest"));
  });

  it("preserves version comments", () => {
    /** Test that updating template files preserves version comments */
    const templateContent = `
name: Test Template
steps:
  - uses: ruby/setup-ruby@44511735964dcb71245e7e55f72539531f7bc0eb # v1.256.0
`;

    const templatePath = path.join(checksDir, "test.yml");
    fs.writeFileSync(templatePath, templateContent);

    const actionVersions = {
      "ruby/setup-ruby": {
        version: "55511735964dcb71245e7e55f72539531f7bc0eb",
        comment: " v1.257.0",
      },
    };

    const result = updateTemplateFiles(
      defaultOptions,
      checksDir,
      actionVersions,
    );
    assert.equal(result.length, 1);

    const updatedContent = fs.readFileSync(templatePath, "utf8");

    assert.ok(
      updatedContent.includes(
        "uses: ruby/setup-ruby@55511735964dcb71245e7e55f72539531f7bc0eb # v1.257.0",
      ),
    );
  });
});
