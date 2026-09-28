#!/usr/bin/env npx tsx

/** Checks a SARIF file to see if certain queries were run and others were not run. */

import * as fs from "node:fs";
import { parseArgs } from "node:util";

import * as core from "@actions/core";
import type { ReportingDescriptor, Log } from "sarif";

import { getErrorMessage } from "./util";

type Options = { sarifFile: string; queriesRun: string; queriesNotRun: string };

function getOptions(): Options {
  const { values } = parseArgs({
    options: {
      // The path of the SARIF file to check.
      "sarif-file": {
        type: "string",
      },
      // The query ids to check are present.
      "queries-run": {
        type: "string",
      },
      // The query ids to check are absent.
      "queries-not-run": {
        type: "string",
      },
    },
    strict: true,
  });

  if (values["sarif-file"] === undefined) {
    throw new Error("The '--sarif-file' input is required.");
  }
  if (values["queries-run"] === undefined) {
    throw new Error("The '--queries-run' input is required.");
  }
  if (values["queries-not-run"] === undefined) {
    throw new Error("The '--queries-not-run' input is required.");
  }

  return {
    sarifFile: values["sarif-file"],
    queriesRun: values["queries-run"],
    queriesNotRun: values["queries-not-run"],
  };
}

function parseQueryIdsInput(queriesRun: string): string[] {
  return queriesRun
    .split(",")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
}

export function checkSarif(sarif: Log, options: Options) {
  if (sarif.runs[0].tool.extensions === undefined) {
    throw new Error(`Couldn't find tool extensions in the SARIF file.`);
  }

  let exitCode = 0;

  // Extract the rule ids from the SARIF file.
  const rules: ReportingDescriptor[] = sarif.runs[0].tool.extensions.flatMap(
    (ext) => ext.rules || [],
  );
  const ruleIds: string[] = rules.map((rule) => rule.id);

  // Check that all the expected queries ran
  const expectedQueriesRun = parseQueryIdsInput(options.queriesRun);
  const queriesThatShouldHaveRunButDidNot = expectedQueriesRun.filter(
    (queryId) => !ruleIds.includes(queryId),
  );

  if (queriesThatShouldHaveRunButDidNot.length > 0) {
    core.error(
      `The following queries were expected to run but did not: ${queriesThatShouldHaveRunButDidNot.join(", ")}`,
    );
    exitCode = -2;
  }

  // Check that all the unexpected queries did not run
  const expectedQueriesNotRun = parseQueryIdsInput(options.queriesNotRun);

  const queriesThatShouldNotHaveRunButDid = expectedQueriesNotRun.filter(
    (queryId) => ruleIds.includes(queryId),
  );

  if (queriesThatShouldNotHaveRunButDid.length > 0) {
    core.error(
      `The following queries were NOT expected to have run but did: ${queriesThatShouldNotHaveRunButDid.join(", ")}`,
    );
    exitCode = -2;
  }

  core.startGroup("All queries that ran");
  for (const rule of rules) {
    core.info(`${rule.id}: ${rule.properties?.name || rule.name}`);
  }
  core.endGroup();

  core.startGroup("Full SARIF");
  core.info(JSON.stringify(sarif, null, 2));
  core.endGroup();

  return exitCode;
}

function main() {
  try {
    const options = getOptions();
    const sarif: Log = JSON.parse(fs.readFileSync(options.sarifFile, "utf8"));

    return checkSarif(sarif, options);
  } catch (err) {
    core.error(`Failed to check SARIF file: ${getErrorMessage(err)}`);
    return -1;
  }
}

if (require.main === module) {
  process.exit(main());
}
