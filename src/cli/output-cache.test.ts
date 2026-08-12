import * as fs from "fs";
import path from "path";

import test from "ava";

import { EnvVar } from "../environment";
import { getTestEnv, setupTests } from "../testing-utils";
import * as util from "../util";

import * as outputCache from "./output-cache";

setupTests(test);

test.serial(
  "getCachedCodeQlVersion reuses a version persisted by an earlier step",
  async (t) => {
    await util.withTmpDir(async (tmpDir: string) => {
      const cacheFile = path.join(tmpDir, "codeql-action-command-cache.json");
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({
          cmd: "/path/to/codeql",
          entries: { version: { version: "2.20.0" } },
        }),
        "utf8",
      );
      const env = getTestEnv({ [EnvVar.TEMP]: tmpDir });
      t.deepEqual(outputCache.getCachedCodeQlVersion(env, "/path/to/codeql"), {
        version: "2.20.0",
      });
    });
  },
);

test.serial(
  "getCachedCodeQlVersion ignores a persisted version from a different CLI",
  async (t) => {
    await util.withTmpDir(async (tmpDir: string) => {
      const cacheFile = path.join(tmpDir, "version.json");
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({
          cmd: "/path/to/other-codeql",
          version: { version: "2.20.0" },
        }),
        "utf8",
      );
      const env = getTestEnv({ [EnvVar.TEMP]: tmpDir });
      t.is(
        outputCache.getCachedCodeQlVersion(env, "/path/to/codeql"),
        undefined,
      );
    });
  },
);

test.serial(
  "getCachedCodeQlVersion ignores a malformed persisted value",
  async (t) => {
    await util.withTmpDir(async (tmpDir: string) => {
      const cacheFile = path.join(tmpDir, "version.json");
      fs.writeFileSync(cacheFile, "not valid json", "utf8");
      const env = getTestEnv({ [EnvVar.TEMP]: tmpDir });
      t.is(
        outputCache.getCachedCodeQlVersion(env, "/path/to/codeql"),
        undefined,
      );
    });
  },
);

test.serial(
  "getCachedCodeQlVersion ignores a persisted value with the wrong structure",
  async (t) => {
    await util.withTmpDir(async (tmpDir: string) => {
      const cacheFile = path.join(tmpDir, "version.json");
      const env = getTestEnv({ [EnvVar.TEMP]: tmpDir });

      const testValues = [
        { cmd: "/path/to/codeql" },
        { cmd: "/path/to/codeql", version: {} },
        { cmd: "/path/to/codeql", version: { version: 2 } },
        { version: { version: "2.20.0" } },
        {
          cmd: "/path/to/codeql",
          version: { version: "2.20.0", overlayVersion: "1" },
        },
        {
          cmd: "/path/to/codeql",
          version: { version: "2.20.0", features: "nope" },
        },
      ].map((v) => JSON.stringify(v));

      for (const value of testValues) {
        fs.writeFileSync(cacheFile, value, "utf8");
        t.is(
          outputCache.getCachedCodeQlVersion(env, "/path/to/codeql"),
          undefined,
          value,
        );
      }
    });
  },
);

test.serial("getCachedCodeQlVersion ignores non-existent file", async (t) => {
  await util.withTmpDir(async (tmpDir: string) => {
    const env = getTestEnv({ [EnvVar.TEMP]: tmpDir });
    t.is(outputCache.getCachedCodeQlVersion(env, "/path/to/codeql"), undefined);
  });
});
