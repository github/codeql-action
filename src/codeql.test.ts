import * as github from "@actions/github";
import * as toolcache from "@actions/tool-cache";
import test from "ava";
import nock from "nock";
import * as path from "path";
import sinon from "sinon";

import * as api from "./api-client";
import * as codeql from "./codeql";
import * as defaults from "./defaults.json"; // Referenced from codeql-action-sync-tool!
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test("download and populate codeql bundle cache", async (t) => {
  await util.withTmpDir(async (tmpDir) => {
    const versions = ["20200601", "20200610"];
    const languages: Language[][] = [
      [Language.cpp],
      [Language.cpp, Language.python], // Multi-language requires the full bundle
    ];

    const platform =
      process.platform === "win32"
        ? "win64"
        : process.platform === "linux"
        ? "linux64"
        : process.platform === "darwin"
        ? "osx64"
        : undefined;

    for (let i = 0; i < versions.length; i++) {
      for (let j = 0; j < languages.length; j++) {
        const version = versions[i];
        const plVersion =
          languages[j].length === 1
            ? `${platform}-${languages[j][0]}`
            : undefined;

        nock("https://example.com")
          .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
          .replyWithFile(
            200,
            path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
          );

        await codeql.setupCodeQL(
          `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`,
          languages[j],
          "token",
          "https://github.example.com",
          tmpDir,
          tmpDir,
          "runner",
          getRunnerLogger(true)
        );

        const toolcacheVersion = plVersion
          ? `0.0.0-${version}-${plVersion}`
          : `0.0.0-${version}`;
        t.assert(
          toolcache.find("CodeQL", toolcacheVersion),
          `Looking for ${toolcacheVersion}`
        );
      }
    }

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    // We should now have 4 cached versions: e.g.,
    // 20200601, 20200601-linux64-cpp, 20200610, 20200610-linux64-cpp
    t.is(cachedVersions.length, 4);
  });
});

test("download small codeql bundle if analyzing only one language", async (t) => {
  // Note: We do not specify a codeqlURL in this test, thus testing that
  //       the logic for constructing the URL takes into account the
  //       language being analyzed
  await util.withTmpDir(async (tmpDir) => {
    const languages: Language[][] = [
      [Language.cpp],
      [Language.cpp, Language.python], // Multi-language requires the full bundle
    ];

    const platform =
      process.platform === "win32"
        ? "win64"
        : process.platform === "linux"
        ? "linux64"
        : process.platform === "darwin"
        ? "osx64"
        : undefined;

    for (let i = 0; i < languages.length; i++) {
      const plVersion =
        languages[i].length === 1
          ? `${platform}-${languages[i][0]}`
          : undefined;
      const pkg = plVersion
        ? `codeql-bundle-${plVersion}.tar.gz`
        : "codeql-bundle.tar.gz";

      // Mock the API client
      const client = new github.GitHub("123");
      const response = {
        data: {
          assets: [
            {
              name: `codeql-bundle-${platform}-cpp.tar.gz`,
              url: `https://github.example.com/url/codeql-bundle-${platform}-cpp.tar.gz`,
            },
            {
              name: "codeql-bundle.tar.gz",
              url: "https://github.example.com/url/codeql-bundle.tar.gz",
            },
          ],
        },
      };
      sinon.stub(client.repos, "getReleaseByTag").resolves(response as any);
      sinon.stub(api, "getApiClient").value(() => client);

      nock("https://github.example.com")
        .get(`/url/${pkg}`)
        .replyWithFile(
          200,
          path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
        );

      await codeql.setupCodeQL(
        undefined,
        languages[i],
        "token",
        "https://github.example.com",
        tmpDir,
        tmpDir,
        "runner",
        getRunnerLogger(true)
      );

      const parsedVersion = codeql.getCodeQLURLVersion(
        `/${defaults.bundleVersion}/`,
        getRunnerLogger(true)
      );
      const toolcacheVersion = plVersion
        ? `${parsedVersion}-${plVersion}`
        : parsedVersion;
      t.assert(
        toolcache.find("CodeQL", toolcacheVersion),
        `Looking for ${toolcacheVersion} - ${plVersion}`
      );
    }

    const cachedVersions = toolcache.findAllVersions("CodeQL");
    t.is(cachedVersions.length, 2);
  });
});

test("use full codeql bundle cache if smaller bundle is not available", async (t) => {
  // If we look for a platform-language version but find the full bundle in the cache,
  // we use the full bundle
  await util.withTmpDir(async (tmpDir) => {
    const version = "20200601";

    nock("https://example.com")
      .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
      .replyWithFile(
        200,
        path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`)
      );

    await codeql.setupCodeQL(
      `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`,
      [],
      "token",
      "https://github.example.com",
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
    t.is(toolcache.findAllVersions("CodeQL").length, 1);

    // Now try to request the cpp version, and see that we do not change the cache
    await codeql.setupCodeQL(
      `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`,
      [Language.cpp],
      "token",
      "https://github.example.com",
      tmpDir,
      tmpDir,
      "runner",
      getRunnerLogger(true)
    );

    t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
    t.is(toolcache.findAllVersions("CodeQL").length, 1);
  });
});

test("use larger bundles if smaller ones are not released", async (t) => {
  // Mock the API client
  const client = new github.GitHub("123");
  const response = {
    data: {
      assets: [{ name: "full-bundle", url: "url/file.gz" }],
    },
  };
  const getReleaseByTagMock = sinon
    .stub(client.repos, "getReleaseByTag")
    .resolves(response as any);
  sinon.stub(api, "getApiClient").value(() => client);

  // Setting this env is required by a dependency of getCodeQLBundleDownloadURL
  process.env["RUNNER_TEMP"] = "abc";

  const codeqlURL = await codeql.getCodeQLBundleDownloadURL(
    ["small-bundle", "full-bundle"],
    "",
    "",
    "actions",
    getRunnerLogger(true)
  );

  t.deepEqual(codeqlURL, "url/file.gz");
  t.assert(getReleaseByTagMock.called);
});

test("parse codeql bundle url version", (t) => {
  const tests = {
    "20200601": "0.0.0-20200601",
    "20200601.0": "0.0.0-20200601.0",
    "20200601.0.0": "20200601.0.0",
    "1.2.3": "1.2.3",
    "1.2.3-alpha": "1.2.3-alpha",
    "1.2.3-beta.1": "1.2.3-beta.1",
    "20200601-linux64-python": "0.0.0-20200601-linux64-python",
  };

  for (const [version, expectedVersion] of Object.entries(tests)) {
    const url = `https://github.com/.../codeql-bundle-${version}/...`;

    try {
      const parsedVersion = codeql.getCodeQLURLVersion(
        url,
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
