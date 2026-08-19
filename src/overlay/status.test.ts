import * as fs from "fs";
import * as path from "path";

import * as actionsCache from "@actions/cache";
import test from "ava";
import * as sinon from "sinon";

import {
  getRecordingLogger,
  LoggedMessage,
  mockCodeQLVersion,
  setupActionsVars,
  setupTests,
} from "../testing-utils";
import { DiskUsage, withTmpDir } from "../util";

import {
  getCacheKey,
  getPullRequestMarkerCacheKey,
  getPullRequestMarkerCacheKeyPrefix,
  savePullRequestFailureMarker,
  shouldSkipOverlayAnalysis,
} from "./status";

setupTests(test);

function makeDiskUsage(totalGiB: number): DiskUsage {
  return {
    numTotalBytes: totalGiB * 1024 * 1024 * 1024,
    numAvailableBytes: 0,
  };
}

test("getCacheKey incorporates language, CodeQL version, and disk space", async (t) => {
  const codeql = mockCodeQLVersion("2.20.0");
  t.is(
    await getCacheKey(codeql, ["javascript"], makeDiskUsage(50)),
    "codeql-overlay-status-javascript-2.20.0-runner-50GB",
  );
  t.is(
    await getCacheKey(codeql, ["python"], makeDiskUsage(50)),
    "codeql-overlay-status-python-2.20.0-runner-50GB",
  );
  t.is(
    await getCacheKey(
      mockCodeQLVersion("2.21.0"),
      ["javascript"],
      makeDiskUsage(50),
    ),
    "codeql-overlay-status-javascript-2.21.0-runner-50GB",
  );
  t.is(
    await getCacheKey(codeql, ["javascript"], makeDiskUsage(100)),
    "codeql-overlay-status-javascript-2.20.0-runner-100GB",
  );
});

test("getCacheKey sorts and joins multiple languages", async (t) => {
  const codeql = mockCodeQLVersion("2.20.0");
  t.is(
    await getCacheKey(codeql, ["python", "javascript"], makeDiskUsage(50)),
    "codeql-overlay-status-javascript+python-2.20.0-runner-50GB",
  );
  t.is(
    await getCacheKey(codeql, ["javascript", "python"], makeDiskUsage(50)),
    "codeql-overlay-status-javascript+python-2.20.0-runner-50GB",
  );
});

test("getCacheKey rounds disk space down to nearest 10 GiB", async (t) => {
  const codeql = mockCodeQLVersion("2.20.0");
  t.is(
    await getCacheKey(codeql, ["javascript"], makeDiskUsage(14)),
    "codeql-overlay-status-javascript-2.20.0-runner-10GB",
  );
  t.is(
    await getCacheKey(codeql, ["javascript"], makeDiskUsage(19)),
    "codeql-overlay-status-javascript-2.20.0-runner-10GB",
  );
});

test.serial(
  "shouldSkipOverlayAnalysis returns false when no cached status exists",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      process.env["RUNNER_TEMP"] = tmpDir;
      const codeql = mockCodeQLVersion("2.20.0");
      const messages: LoggedMessage[] = [];
      const logger = getRecordingLogger(messages);

      sinon.stub(actionsCache, "restoreCache").resolves(undefined);

      const result = await shouldSkipOverlayAnalysis(
        codeql,
        ["javascript"],
        makeDiskUsage(50),
        logger,
      );

      t.false(result);
      t.true(
        messages.some(
          (m) =>
            m.type === "debug" &&
            typeof m.message === "string" &&
            m.message.includes("No overlay status found in Actions cache."),
        ),
      );
    });
  },
);

test.serial(
  "shouldSkipOverlayAnalysis returns true when cached status indicates failed build",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      process.env["RUNNER_TEMP"] = tmpDir;
      const codeql = mockCodeQLVersion("2.20.0");
      const messages: LoggedMessage[] = [];
      const logger = getRecordingLogger(messages);

      const status = {
        attemptedToBuildOverlayBaseDatabase: true,
        builtOverlayBaseDatabase: false,
      };

      // Stub restoreCache to write the status file and return a key
      sinon.stub(actionsCache, "restoreCache").callsFake(async (paths) => {
        const statusFile = paths[0];
        await fs.promises.mkdir(path.dirname(statusFile), { recursive: true });
        await fs.promises.writeFile(statusFile, JSON.stringify(status));
        return "found-key";
      });

      const result = await shouldSkipOverlayAnalysis(
        codeql,
        ["javascript"],
        makeDiskUsage(50),
        logger,
      );

      t.true(result);
    });
  },
);

test.serial(
  "shouldSkipOverlayAnalysis returns false when cached status indicates successful build",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      process.env["RUNNER_TEMP"] = tmpDir;
      const codeql = mockCodeQLVersion("2.20.0");
      const messages: LoggedMessage[] = [];
      const logger = getRecordingLogger(messages);

      const status = {
        attemptedToBuildOverlayBaseDatabase: true,
        builtOverlayBaseDatabase: true,
      };

      sinon.stub(actionsCache, "restoreCache").callsFake(async (paths) => {
        const statusFile = paths[0];
        await fs.promises.mkdir(path.dirname(statusFile), { recursive: true });
        await fs.promises.writeFile(statusFile, JSON.stringify(status));
        return "found-key";
      });

      const result = await shouldSkipOverlayAnalysis(
        codeql,
        ["javascript"],
        makeDiskUsage(50),
        logger,
      );

      t.false(result);
      t.true(
        messages.some(
          (m) =>
            m.type === "debug" &&
            typeof m.message === "string" &&
            m.message.includes(
              "Cached overlay status does not indicate a previous unsuccessful attempt",
            ),
        ),
      );
    });
  },
);

test("getPullRequestMarkerCacheKeyPrefix mirrors the status cache key dimensions", async (t) => {
  const codeql = mockCodeQLVersion("2.20.0");
  t.is(
    await getPullRequestMarkerCacheKeyPrefix(
      codeql,
      ["python", "javascript"],
      makeDiskUsage(50),
    ),
    "codeql-overlay-pr-status-javascript+python-2.20.0-runner-50GB-",
  );
});

test.serial(
  "getPullRequestMarkerCacheKey includes the workflow run and check run details",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir, {
        GITHUB_RUN_ID: "42",
        GITHUB_RUN_ATTEMPT: "2",
      });
      const codeql = mockCodeQLVersion("2.20.0");
      t.is(
        await getPullRequestMarkerCacheKey(
          codeql,
          ["javascript"],
          makeDiskUsage(50),
          7,
        ),
        "codeql-overlay-pr-status-javascript-2.20.0-runner-50GB-42-2-7",
      );
      t.is(
        await getPullRequestMarkerCacheKey(
          codeql,
          ["javascript"],
          makeDiskUsage(50),
          undefined,
        ),
        "codeql-overlay-pr-status-javascript-2.20.0-runner-50GB-42-2-unknown",
      );
    });
  },
);

test.serial(
  "savePullRequestFailureMarker reports failure when the cache entry is not saved",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      const saveCacheStub = sinon.stub(actionsCache, "saveCache").resolves(-1);

      t.false(
        await savePullRequestFailureMarker(
          mockCodeQLVersion("2.20.0"),
          ["javascript"],
          makeDiskUsage(50),
          7,
          getRecordingLogger([]),
        ),
      );
      t.is(
        saveCacheStub.firstCall.args[1],
        "codeql-overlay-pr-status-javascript-2.20.0-runner-50GB-1-1-7",
      );

      saveCacheStub.resolves(1);
      t.true(
        await savePullRequestFailureMarker(
          mockCodeQLVersion("2.20.0"),
          ["javascript"],
          makeDiskUsage(50),
          7,
          getRecordingLogger([]),
        ),
      );
    });
  },
);
