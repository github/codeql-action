import * as fs from "fs";
import * as path from "path";

import test from "ava";

import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";
import * as uploadLib from "./upload-lib";
import { GitHubVersion, GitHubVariant, withTmpDir } from "./util";

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
    { type: GitHubVariant.DOTCOM },
    { type: GitHubVariant.GHES, version: "3.1.0" },
  ];
  const oldVersions: GitHubVersion[] = [
    { type: GitHubVariant.GHES, version: "2.22.1" },
    { type: GitHubVariant.GHES, version: "3.0.0" },
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
    t.deepEqual(payload.base_ref, "refs/heads/master");
    t.deepEqual(payload.base_sha, "f95f852bd8fca8fcc58a9a2d6c842781e32a215e");
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

test("finding SARIF files", async (t) => {
  await withTmpDir(async (tmpDir) => {
    // include a couple of sarif files
    fs.writeFileSync(path.join(tmpDir, "a.sarif"), "");
    fs.writeFileSync(path.join(tmpDir, "b.sarif"), "");

    // other random files shouldn't be returned
    fs.writeFileSync(path.join(tmpDir, "c.foo"), "");

    // we should recursively look in subdirectories
    fs.mkdirSync(path.join(tmpDir, "dir1"));
    fs.writeFileSync(path.join(tmpDir, "dir1", "d.sarif"), "");
    fs.mkdirSync(path.join(tmpDir, "dir1", "dir2"));
    fs.writeFileSync(path.join(tmpDir, "dir1", "dir2", "e.sarif"), "");

    // we should ignore symlinks
    fs.mkdirSync(path.join(tmpDir, "dir3"));
    fs.symlinkSync(tmpDir, path.join(tmpDir, "dir3", "symlink1"), "dir");
    fs.symlinkSync(
      path.join(tmpDir, "a.sarif"),
      path.join(tmpDir, "dir3", "symlink2.sarif"),
      "file"
    );

    const sarifFiles = uploadLib.findSarifFilesInDir(tmpDir);

    t.deepEqual(sarifFiles, [
      path.join(tmpDir, "a.sarif"),
      path.join(tmpDir, "b.sarif"),
      path.join(tmpDir, "dir1", "d.sarif"),
      path.join(tmpDir, "dir1", "dir2", "e.sarif"),
    ]);
  });
});

test("populateRunAutomationDetails", (t) => {
  let sarif = '{"runs": [{}]}';
  const analysisKey = ".github/workflows/codeql-analysis.yml:analyze";

  let expectedSarif =
    '{"runs":[{"automationDetails":{"id":".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/"}}]}';

  let modifiedSarif = uploadLib.populateRunAutomationDetails(
    sarif,
    analysisKey,
    '{"language": "javascript", "os": "linux"}'
  );
  t.deepEqual(modifiedSarif, expectedSarif);

  // check the environment sorting
  modifiedSarif = uploadLib.populateRunAutomationDetails(
    sarif,
    analysisKey,
    '{"os": "linux", "language": "javascript"}'
  );
  t.deepEqual(modifiedSarif, expectedSarif);

  // check that an empty environment produces the right results
  expectedSarif =
    '{"runs":[{"automationDetails":{"id":".github/workflows/codeql-analysis.yml:analyze/"}}]}';
  modifiedSarif = uploadLib.populateRunAutomationDetails(
    sarif,
    analysisKey,
    "{}"
  );
  t.deepEqual(modifiedSarif, expectedSarif);

  // check non string environment values
  expectedSarif =
    '{"runs":[{"automationDetails":{"id":".github/workflows/codeql-analysis.yml:analyze/number:/object:/"}}]}';
  modifiedSarif = uploadLib.populateRunAutomationDetails(
    sarif,
    analysisKey,
    '{"number": 1, "object": {"language": "javascript"}}'
  );
  t.deepEqual(modifiedSarif, expectedSarif);

  // check that the automation details doesn't get overwritten
  sarif = '{"runs":[{"automationDetails":{"id":"my_id"}}]}';
  expectedSarif = '{"runs":[{"automationDetails":{"id":"my_id"}}]}';
  modifiedSarif = uploadLib.populateRunAutomationDetails(
    sarif,
    analysisKey,
    '{"os": "linux", "language": "javascript"}'
  );
  t.deepEqual(modifiedSarif, expectedSarif);
});
