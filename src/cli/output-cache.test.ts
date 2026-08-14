import * as fs from "fs";
import path from "path";

import test from "ava";

import { getRunnerLogger } from "../logging";
import { setupTests } from "../testing-utils";
import * as util from "../util";

import { getCachedCodeQlVersion } from "./output-cache";

setupTests(test);

const logger = getRunnerLogger(true);

test.serial(
  "getCachedCodeQlVersion reuses a version persisted by an earlier step",
  async (t) => {
    await util.withTmpDir(async (tmpDir: string) => {
      const cacheFilePath = path.join(tmpDir, "cache.json");

      fs.writeFileSync(
        cacheFilePath,
        JSON.stringify({
          cmd: "/path/to/codeql",
          entries: { version: { version: "2.20.0" } },
        }),
        "utf8",
      );
      t.deepEqual(
        getCachedCodeQlVersion(logger, cacheFilePath, "/path/to/codeql"),
        {
          version: "2.20.0",
        },
      );
    });
  },
);

test.serial(
  "getCachedCodeQlVersion ignores a persisted version from a different CLI",
  async (t) => {
    await util.withTmpDir(async (tmpDir: string) => {
      const cacheFilePath = path.join(tmpDir, "cache.json");
      fs.writeFileSync(
        cacheFilePath,
        JSON.stringify({
          cmd: "/path/to/other-codeql",
          entries: { version: { version: "2.20.0" } },
        }),
        "utf8",
      );
      t.is(
        getCachedCodeQlVersion(logger, cacheFilePath, "/path/to/codeql"),
        undefined,
      );
    });
  },
);

test.serial(
  "getCachedCodeQlVersion ignores a malformed persisted value",
  async (t) => {
    await util.withTmpDir(async (tmpDir: string) => {
      const cacheFilePath = path.join(tmpDir, "cache.json");
      fs.writeFileSync(cacheFilePath, "not valid json", "utf8");
      t.is(
        getCachedCodeQlVersion(logger, cacheFilePath, "/path/to/codeql"),
        undefined,
      );
    });
  },
);

test.serial(
  "getCachedCodeQlVersion ignores a persisted value with the wrong structure",
  async (t) => {
    await util.withTmpDir(async (tmpDir: string) => {
      const cacheFilePath = path.join(tmpDir, "cache.json");
      const testValues = [
        { cmd: "/path/to/codeql" },
        { entries: { version: { version: "2.20.0" } } },
        { cmd: "/path/to/codeql", entries: {} },
        { cmd: "/path/to/codeql", entries: null },
        { cmd: "/path/to/codeql", entries: { version: {} } },
        { cmd: "/path/to/codeql", entries: { version: null } },
        { cmd: "/path/to/codeql", entries: { version: "2.20.0" } },
        { cmd: "/path/to/codeql", entries: { version: { version: null } } },
        { cmd: "/path/to/codeql", entries: { version: { version: 2.2 } } },
        { cmd: "/path/to/codeql", entries: { version: { version: 2 } } },
        {
          cmd: "/path/to/codeql",
          entries: { version: { version: "2.20.0", overlayVersion: "1" } },
        },
        {
          cmd: "/path/to/codeql",
          entries: { version: { version: "2.20.0", features: "nope" } },
        },
      ].map((v) => JSON.stringify(v));

      for (const value of testValues) {
        fs.writeFileSync(cacheFilePath, value, "utf8");
        t.is(
          getCachedCodeQlVersion(logger, cacheFilePath, "/path/to/codeql"),
          undefined,
          value,
        );
      }
    });
  },
);

test.serial("getCachedCodeQlVersion ignores non-existent file", async (t) => {
  await util.withTmpDir(async (tmpDir: string) => {
    const cacheFilePath = path.join(tmpDir, "cache.json");
    t.notThrows(() => {
      t.is(
        getCachedCodeQlVersion(logger, cacheFilePath, "/path/to/codeql"),
        undefined,
      );
    });
  });
});
