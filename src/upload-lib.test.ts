import test from "ava";

import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";
import * as uploadLib from "./upload-lib";
import { GitHubVersion } from "./util";

setupTests(test);

test("validateSarifFileSchema - valid", (t) => {
  const inputFile = `${__dirname}/../src/testdata/valid-sarif.sarif`;
  t.notThrows(() =>
    uploadLib.validateSarifFileSchema(inputFile, getRunnerLogger(true))
  );
});

test("validateSarifFileSchema - invalid", (t) => {
  const inputFile = `${__dirname}/../src/testdata/invalid-sarif.sarif`;
  t.throws(() =>
    uploadLib.validateSarifFileSchema(inputFile, getRunnerLogger(true))
  );
});

test("validate correct payload used per version", async (t) => {
  const newVersions: GitHubVersion[] = [
    { type: "dotcom" },
    { type: "ghes", version: "3.1.0" },
  ];
  const oldVersions: GitHubVersion[] = [
    { type: "ghes", version: "2.22.1" },
    { type: "ghes", version: "3.0.0" },
  ];
  const allVersions = newVersions.concat(oldVersions);

  process.env["GITHUB_EVENT_NAME"] = "push";
  for (const version of allVersions) {
    const payload: any = uploadLib.buildPayload(
      "commit",
      "refs/heads/master",
      "key",
      undefined,
      "",
      undefined,
      "/opt/src",
      undefined,
      ["CodeQL", "eslint"],
      version,
      "actions"
    );
    // Not triggered by a pull request
    t.falsy(payload.base_ref);
    t.falsy(payload.base_sha);
  }

  process.env["GITHUB_EVENT_NAME"] = "pull_request";
  process.env[
    "GITHUB_EVENT_PATH"
  ] = `${__dirname}/../src/testdata/pull_request.json`;
  for (const version of newVersions) {
    const payload: any = uploadLib.buildPayload(
      "commit",
      "refs/pull/123/merge",
      "key",
      undefined,
      "",
      undefined,
      "/opt/src",
      undefined,
      ["CodeQL", "eslint"],
      version,
      "actions"
    );
    t.truthy(payload.base_ref);
    t.truthy(payload.base_sha);
  }

  for (const version of oldVersions) {
    const payload: any = uploadLib.buildPayload(
      "commit",
      "refs/pull/123/merge",
      "key",
      undefined,
      "",
      undefined,
      "/opt/src",
      undefined,
      ["CodeQL", "eslint"],
      version,
      "actions"
    );
    // These older versions won't expect these values
    t.falsy(payload.base_ref);
    t.falsy(payload.base_sha);
  }
});
