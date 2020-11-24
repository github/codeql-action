import * as path from "path";

import * as toolcache from "@actions/tool-cache";
import test from "ava";
import nock from "nock";

import * as codeql from "./codeql";
import * as defaults from "./defaults.json";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

const sampleApiDetails = {
  auth: "token",
  url: "https://github.com",
};

test("download codeql bundle cache", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const versions = ["20200601", "20200610"];

    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];

      nock("https://example.com")
        .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
        .replyWithFile(
          200,
          path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
        );

      await codeql.setupCodeQL(
        `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`,
        sampleApiDetails,
        tmpDir,
        tmpDir,
        "runner",
        getRunnerLogger(true)
      );

      t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
    }

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 2);
  });
});

test("download codeql bundle cache explicitly requested with pinned different version cached", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    nock("https://example.com")
      .get(`/download/codeql-bundle-20200601/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));

    nock("https://example.com")
      .get(`/download/codeql-bundle-20200610/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200610/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200610"));
  });
});

test("don't download codeql bundle cache with pinned different version cached", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    nock("https://example.com")
      .get(`/download/codeql-bundle-20200601/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));

    await codeql.setupCodeQL(
      undefined,
      sampleApiDetails,
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 1);
  });
});

test("download codeql bundle cache with different version cached (not pinned)", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    nock("https://example.com")
      .get(`/download/codeql-bundle-20200601/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));
    const platform =
      process.platform === "win32"
        ? "win64"
        : process.platform === "linux"
        ? "linux64"
        : "osx64";

    nock("https://github.com")
      .get(
        `/github/codeql-action/releases/download/${defaults.bundleVersion}/codeql-bundle-${platform}.tar.gz`
      )
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      undefined,
      sampleApiDetails,
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 2);
  });
});

test('download codeql bundle cache with pinned different version cached if "latests" tools specified', async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    nock("https://example.com")
      .get(`/download/codeql-bundle-20200601/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle-pinned.tar.gz`)
      );

    await codeql.setupCodeQL(
      "https://example.com/download/codeql-bundle-20200601/codeql-bundle.tar.gz",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    t.assert(toolcache.find("CodeQL", "0.0.0-20200601"));

    const platform =
      process.platform === "win32"
        ? "win64"
        : process.platform === "linux"
        ? "linux64"
        : "osx64";

    nock("https://github.com")
      .get(
        `/github/codeql-action/releases/download/${defaults.bundleVersion}/codeql-bundle-${platform}.tar.gz`
      )
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      "latest",
      sampleApiDetails,
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    const cachedVersions = toolcache.findAllVersions("CodeQL");

    t.is(cachedVersions.length, 2);
  });
});

test("parse codeql bundle url version", (t) => {
  t.deepEqual(
    codeql.getCodeQLURLVersion(
      "https://github.com/.../codeql-bundle-20200601/..."
    ),
    "20200601"
  );
});

test("convert to semver", (t) => {
  const tests = {
    "20200601": "0.0.0-20200601",
    "20200601.0": "0.0.0-20200601.0",
    "20200601.0.0": "20200601.0.0",
    "1.2.3": "1.2.3",
    "1.2.3-alpha": "1.2.3-alpha",
    "1.2.3-beta.1": "1.2.3-beta.1",
  };

  for (const [version, expectedVersion] of Object.entries(tests)) {
    try {
      const parsedVersion = codeql.convertToSemVer(
        version,
        getRunnerLogger(true)
      );
      t.deepEqual(parsedVersion, expectedVersion);
    } catch (e) {
      t.fail(e.message);
    }
  }
});

test("getExtraOptions works for explicit paths", (t) => {
  t.deepEqual(codeql.getExtraOptions({}, ["foo"], []), []);

  t.deepEqual(codeql.getExtraOptions({ foo: [42] }, ["foo"], []), ["42"]);

  t.deepEqual(
    codeql.getExtraOptions({ foo: { bar: [42] } }, ["foo", "bar"], []),
    ["42"]
  );
});

test("getExtraOptions works for wildcards", (t) => {
  t.deepEqual(codeql.getExtraOptions({ "*": [42] }, ["foo"], []), ["42"]);
});

test("getExtraOptions works for wildcards and explicit paths", (t) => {
  const o1 = { "*": [42], foo: [87] };
  t.deepEqual(codeql.getExtraOptions(o1, ["foo"], []), ["42", "87"]);

  const o2 = { "*": [42], foo: [87] };
  t.deepEqual(codeql.getExtraOptions(o2, ["foo", "bar"], []), ["42"]);

  const o3 = { "*": [42], foo: { "*": [87], bar: [99] } };
  const p = ["foo", "bar"];
  t.deepEqual(codeql.getExtraOptions(o3, p, []), ["42", "87", "99"]);
});

test("getExtraOptions throws for bad content", (t) => {
  t.throws(() => codeql.getExtraOptions({ "*": 42 }, ["foo"], []));

  t.throws(() => codeql.getExtraOptions({ foo: 87 }, ["foo"], []));

  t.throws(() =>
    codeql.getExtraOptions(
      { "*": [42], foo: { "*": 87, bar: [99] } },
      ["foo", "bar"],
      []
    )
  );
});
