import { once } from "events";
import * as path from "path";

import * as toolcache from "@actions/tool-cache";
import test from "ava";
import nock from "nock";
import * as sinon from "sinon";

import { getRunnerLogger } from "./logging";
import * as tar from "./tar";
import { setupTests } from "./testing-utils";
import { downloadAndExtract } from "./tools-download";
import { withTmpDir } from "./util";

setupTests(test);

test.serial(
  "downloadAndExtract reports the duration when downloading before extracting",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      const archivePath = path.join(tmpDir, "codeql-bundle.tar.gz");
      const destination = path.join(tmpDir, "codeql");
      sinon.stub(toolcache, "downloadTool").resolves(archivePath);
      sinon.stub(tar, "extract").resolves(destination);

      const statusReport = await downloadAndExtract(
        "https://example.com/codeql-bundle.tar.gz",
        "gzip",
        destination,
        undefined,
        {},
        undefined,
        getRunnerLogger(true),
      );

      t.assert(Number.isInteger(statusReport.downloadDurationMs));
    });
  },
);

test.serial(
  "downloadAndExtract omits the download duration when streaming extraction",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      sinon.stub(process, "platform").value("linux");
      const downloadTool = sinon.stub(toolcache, "downloadTool");
      const extractTarZst = sinon
        .stub(tar, "extractTarZst")
        .callsFake(async (archive) => {
          if (typeof archive === "string") {
            t.fail("Expected the Zstandard archive to be streamed.");
            return;
          }
          const end = once(archive, "end");
          archive.resume();
          await end;
        });
      const request = nock("https://example.com")
        .get("/codeql-bundle.tar.zst")
        .reply(200, "archive");

      const statusReport = await downloadAndExtract(
        "https://example.com/codeql-bundle.tar.zst",
        "zstd",
        path.join(tmpDir, "codeql"),
        undefined,
        {},
        { type: "gnu", version: "1.34" },
        getRunnerLogger(true),
      );

      t.deepEqual(statusReport, {});
      t.false(downloadTool.called);
      t.true(extractTarZst.calledOnce);
      t.true(request.isDone());
    });
  },
);
