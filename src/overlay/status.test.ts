import test from "ava";

import { mockCodeQLVersion, setupTests } from "../testing-utils";
import { DiskUsage } from "../util";

import { getCacheKey } from "./status";

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
    await getCacheKey(codeql, "javascript", makeDiskUsage(50)),
    "codeql-overlay-status-javascript-2.20.0-runner-50GB",
  );
  t.is(
    await getCacheKey(codeql, "python", makeDiskUsage(50)),
    "codeql-overlay-status-python-2.20.0-runner-50GB",
  );
  t.is(
    await getCacheKey(
      mockCodeQLVersion("2.21.0"),
      "javascript",
      makeDiskUsage(50),
    ),
    "codeql-overlay-status-javascript-2.21.0-runner-50GB",
  );
  t.is(
    await getCacheKey(codeql, "javascript", makeDiskUsage(100)),
    "codeql-overlay-status-javascript-2.20.0-runner-100GB",
  );
});

test("getCacheKey rounds disk space down to nearest 10 GiB", async (t) => {
  const codeql = mockCodeQLVersion("2.20.0");
  t.is(
    await getCacheKey(codeql, "javascript", makeDiskUsage(14)),
    "codeql-overlay-status-javascript-2.20.0-runner-10GB",
  );
  t.is(
    await getCacheKey(codeql, "javascript", makeDiskUsage(19)),
    "codeql-overlay-status-javascript-2.20.0-runner-10GB",
  );
});
