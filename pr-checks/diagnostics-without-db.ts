import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";

import type * as diagnostics from "../src/diagnostics";

const DIAGNOSTIC_ID = "codeql-action/forced-nightly-cli";
const diagnosticDirectory = process.env["DIAGNOSTICS_DIR"];

if (diagnosticDirectory === undefined) {
  throw new Error("DIAGNOSTICS_DIR is undefined.");
}

const paths = fs
  .readdirSync(diagnosticDirectory, {
    recursive: true,
    encoding: "utf-8",
  })
  .filter((p) => p.endsWith(".json"));

core.info(`Found ${paths.length} paths in '${diagnosticDirectory}'.`);
core.info(`Searching for a diagnostic with id '${DIAGNOSTIC_ID}'...`);

let found = false;
for (const diagnosticPath of paths) {
  if (path.extname(diagnosticPath) !== ".json") {
    core.info(`Skipping ${diagnosticPath}.`);
    continue;
  }
  core.info(`Found ${diagnosticPath}.`);

  const contents = JSON.parse(
    fs.readFileSync(path.resolve(diagnosticDirectory, diagnosticPath), "utf-8"),
  ) as diagnostics.DiagnosticMessage;

  if (contents.source.id === DIAGNOSTIC_ID) {
    core.info(
      `Found '${DIAGNOSTIC_ID}' in '${diagnosticPath}'. Skipping remaining files.`,
    );
    found = true;
    break;
  }
}

if (!found) {
  throw new Error(`Didn't find '${DIAGNOSTIC_ID}' diagnostic.`);
}
