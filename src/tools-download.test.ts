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
  "downloadAndExtract reports the durations when downloading before extracting",
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
      t.assert(Number.isInteger(statusReport.extractionDurationMs));
      t.assert(Number.isInteger(statusReport.totalDurationMs));
    });
  },
);

test.serial(
  "downloadAndExtract falls back to downloading before extracting if streaming fails",
  async (t) => {
    await withTmpDir(async (tmpDir) => {
      sinon.stub(process, "platform").value("linux");
      const archivePath = path.join(tmpDir, "codeql-bundle.tar.zst");
      const destination = path.join(tmpDir, "codeql");
      const downloadTool = sinon
        .stub(toolcache, "downloadTool")
        .resolves(archivePath);
      const extract = sinon.stub(tar, "extract").resolves(destination);
      const extractTarZst = sinon.stub(tar, "extractTarZst").resolves();
      const request = nock("https://example.com")
        .get("/codeql-bundle.tar.zst")
        .replyWithError(
          Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
        );

      const statusReport = await downloadAndExtract(
        "https://example.com/codeql-bundle.tar.zst",
        "zstd",
        destination,
        undefined,
        {},
        { type: "gnu", version: "1.34" },
        getRunnerLogger(true),
      );

      t.assert(Number.isInteger(statusReport.downloadDurationMs));
      t.assert(Number.isInteger(statusReport.totalDurationMs));
      t.true(request.isDone());
      t.false(extractTarZst.called);
      t.true(downloadTool.calledOnce);
      t.true(extract.calledOnce);
    });
  },
);

test.serial(
  "downloadAndExtract reports only the total duration when streaming extraction",
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

      t.assert(Number.isInteger(statusReport.totalDurationMs));
      t.is(statusReport.downloadDurationMs, undefined);
      t.is(statusReport.extractionDurationMs, undefined);
      t.false(downloadTool.called);
      t.true(extractTarZst.calledOnce);
      t.true(request.isDone());
    });
  },
);
