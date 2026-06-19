import * as fs from "fs";
import * as os from "os";
import path from "path";

import test from "ava";

import {
  cacheCommandOutput,
  getCachedCommandOutput,
  resetCachedCommandOutputs,
  CommandCacheKey,
} from "./cache";
import { isVersionInfo } from "./codeql";
import { setupTests } from "./testing-utils";

setupTests(test);

const COMMAND_CACHE_FILENAME = "codeql-action-command-cache.json";

/**
 * Runs `body` with a temporary directory configured as the cache's backing
 * store (`RUNNER_TEMP`). `CODEQL_ACTION_TEMP` is cleared so that
 * `getTemporaryDirectory()` falls back to `RUNNER_TEMP`.
 *
 * `setupTests` snapshots and restores `process.env` around every test, so we
 * don't restore the environment variables we set here ourselves.
 */
async function withCacheDir(
  body: (cacheFilePath: string) => Promise<void> | void,
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-test-"));
  process.env["RUNNER_TEMP"] = tmpDir;
  delete process.env["CODEQL_ACTION_TEMP"];
  resetCachedCommandOutputs();
  try {
    await body(path.join(tmpDir, COMMAND_CACHE_FILENAME));
  } finally {
    await fs.promises.rm(tmpDir, { force: true, recursive: true });
  }
}

function writeCacheFile(
  cacheFilePath: string,
  contents: Record<string, unknown>,
): void {
  fs.writeFileSync(cacheFilePath, JSON.stringify(contents));
}

test.serial(
  "getCachedCommandOutput reuses an output persisted by an earlier step",
  async (t) => {
    await withCacheDir((cacheFilePath) => {
      writeCacheFile(cacheFilePath, {
        [CommandCacheKey.Version]: {
          cmd: "/path/to/codeql",
          output: { version: "2.20.0" },
        },
      });
      t.deepEqual(
        getCachedCommandOutput(
          CommandCacheKey.Version,
          "/path/to/codeql",
          isVersionInfo,
        ),
        { version: "2.20.0" },
      );
    });
  },
);

test.serial(
  "getCachedCommandOutput ignores an output persisted from a different CLI",
  async (t) => {
    await withCacheDir((cacheFilePath) => {
      writeCacheFile(cacheFilePath, {
        [CommandCacheKey.Version]: {
          cmd: "/path/to/other-codeql",
          output: { version: "2.20.0" },
        },
      });
      t.is(
        getCachedCommandOutput(
          CommandCacheKey.Version,
          "/path/to/codeql",
          isVersionInfo,
        ),
        undefined,
      );
    });
  },
);

test.serial(
  "getCachedCommandOutput ignores a malformed cache file",
  async (t) => {
    await withCacheDir((cacheFilePath) => {
      fs.writeFileSync(cacheFilePath, "not valid json");
      t.is(
        getCachedCommandOutput(
          CommandCacheKey.Version,
          "/path/to/codeql",
          isVersionInfo,
        ),
        undefined,
      );
    });
  },
);

test.serial(
  "getCachedCommandOutput returns undefined when there is no cache file",
  async (t) => {
    await withCacheDir(() => {
      t.is(
        getCachedCommandOutput(
          CommandCacheKey.Version,
          "/path/to/codeql",
          isVersionInfo,
        ),
        undefined,
      );
    });
  },
);

test.serial(
  "getCachedCommandOutput ignores an output that fails validation",
  async (t) => {
    await withCacheDir((cacheFilePath) => {
      for (const output of [
        {},
        { version: 2 },
        { version: "2.20.0", overlayVersion: "1" },
        { version: "2.20.0", features: "nope" },
      ]) {
        resetCachedCommandOutputs();
        writeCacheFile(cacheFilePath, {
          [CommandCacheKey.Version]: { cmd: "/path/to/codeql", output },
        });
        t.is(
          getCachedCommandOutput(
            CommandCacheKey.Version,
            "/path/to/codeql",
            isVersionInfo,
          ),
          undefined,
          JSON.stringify(output),
        );
      }
    });
  },
);

test.serial(
  "getCachedCommandOutput ignores an entry missing the cmd field",
  async (t) => {
    await withCacheDir((cacheFilePath) => {
      writeCacheFile(cacheFilePath, {
        [CommandCacheKey.Version]: { output: { version: "2.20.0" } },
      });
      t.is(
        getCachedCommandOutput(
          CommandCacheKey.Version,
          "/path/to/codeql",
          isVersionInfo,
        ),
        undefined,
      );
    });
  },
);

test.serial(
  "cacheCommandOutput persists the output to both the memo and the file",
  async (t) => {
    await withCacheDir((cacheFilePath) => {
      cacheCommandOutput(CommandCacheKey.Version, "/path/to/codeql", {
        hello: "world",
      });

      // Tier 2: the temporary file contains the entry.
      const onDisk = JSON.parse(
        fs.readFileSync(cacheFilePath, "utf8"),
      ) as Record<string, unknown>;
      t.deepEqual(onDisk[CommandCacheKey.Version], {
        cmd: "/path/to/codeql",
        output: { hello: "world" },
      });

      // Tier 1: the value is served from the memo even after the file is gone.
      fs.rmSync(cacheFilePath);
      t.deepEqual(
        getCachedCommandOutput(CommandCacheKey.Version, "/path/to/codeql"),
        { hello: "world" },
      );
    });
  },
);

test.serial(
  "getCachedCommandOutput prefers the in-memory memo over the file",
  async (t) => {
    await withCacheDir((cacheFilePath) => {
      cacheCommandOutput(CommandCacheKey.Version, "/path/to/codeql", {
        value: 1,
      });

      // Overwrite the file with a different value; the memo (tier 1) should win.
      writeCacheFile(cacheFilePath, {
        [CommandCacheKey.Version]: { cmd: "/path/to/codeql", output: { value: 2 } },
      });
      t.deepEqual(
        getCachedCommandOutput(CommandCacheKey.Version, "/path/to/codeql"),
        { value: 1 },
      );
    });
  },
);
