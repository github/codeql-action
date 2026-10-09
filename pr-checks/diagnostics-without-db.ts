import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";

import type * as diagnostics from "../src/diagnostics";

const DIAGNOSTIC_ID = "codeql-action/forced-nightly-cli";
const sarifDirectory = process.env["SARIF_PATH"];

if (sarifDirectory === undefined) {
  throw new Error("SARIF_PATH is undefined.");
}

const paths = fs.readdirSync(sarifDirectory, {
  recursive: true,
  encoding: "utf-8",
});

let found = false;
for (const diagnosticPath of paths) {
  if (path.extname(diagnosticPath) !== ".json") {
    core.info(`Skipping ${diagnosticPath}.`);
    continue;
  }
  core.info(`Found ${diagnosticPath}.`);

  const contents = JSON.parse(
    fs.readFileSync(path.resolve(sarifDirectory, diagnosticPath), "utf-8"),
  ) as diagnostics.DiagnosticMessage;

  if (contents.source.id === DIAGNOSTIC_ID) {
    found = true;
    break;
  }
}

if (!found) {
  throw new Error(`Didn't find '${DIAGNOSTIC_ID}' diagnostic.`);
}
