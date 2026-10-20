#!/usr/bin/env npx tsx

/**
 * Provides utility commands for working with the Actions toolcache in PR checks.
 */

import fs from "fs";
import { parseArgs } from "node:util";
import path from "path";

import * as core from "@actions/core";
import * as toolcache from "@actions/tool-cache";

function removeCodeQLFromToolcache() {
  const toolcachePath = process.env["RUNNER_TOOL_CACHE"];

  if (toolcachePath === undefined) {
    throw new Error("Expected RUNNER_TOOL_CACHE to be defined");
  }

  const codeqlPath = path.join(toolcachePath, "CodeQL");
  fs.rmSync(codeqlPath, { recursive: true });

  core.info(`Removed '${codeqlPath}' from the toolcache.`);
}

function findCodeQL() {
  return toolcache.findAllVersions("CodeQL");
}

function noCodeQLInToolcache() {
  const allCodeqlVersions = findCodeQL();
  if (allCodeqlVersions.length !== 0) {
    throw new Error(
      `CodeQL should not be found in the toolcache, but found ${allCodeqlVersions}`,
    );
  }
  core.info("No versions of CodeQL found in the toolcache");
}

function hasCodeQLInToolcache(expectedNumber?: string) {
  const expected =
    expectedNumber !== undefined
      ? Number.parseInt(expectedNumber, 10)
      : undefined;

  const allCodeqlVersions = findCodeQL();
  core.info(`Found CodeQL versions: ${allCodeqlVersions}`);

  if (allCodeqlVersions.length === 0) {
    throw new Error("CodeQL not found in toolcache");
  }
  if (expected !== undefined && allCodeqlVersions.length !== expected) {
    throw new Error(
      `Expected ${expected} versions of CodeQL in the toolcache, but found ${allCodeqlVersions.length}`,
    );
  }
}

function main() {
  const { positionals, values } = parseArgs({
    options: {
      // The *number* of expected versions in the toolcache.
      expectedVersions: { type: "string", short: "n" },
    },
    allowPositionals: true,
  });

  if (positionals.length < 1) {
    throw new Error("Command not specified.");
  }

  const cmd = positionals[0];

  switch (cmd.trim().toLowerCase()) {
    case "clear":
      removeCodeQLFromToolcache();
      return;
    case "absent":
      noCodeQLInToolcache();
      return;
    case "installed":
      hasCodeQLInToolcache(values.expectedVersions);
      return;
    default:
      throw new Error(`Unknown command '${cmd}'.`);
  }
}

try {
  main();
} catch (err) {
  core.setFailed(err instanceof Error ? err.message : String(err));
}
