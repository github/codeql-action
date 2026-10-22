import * as path from "path";
import * as stream from "stream";

import test from "ava";

import { extractTarZst } from "./tar";
import { RecordingLogger, setupTests } from "./testing-utils";
import { withTmpDir } from "./util";

setupTests(test);

test("extractTarZst rejects if the input stream errors", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const archive = new stream.PassThrough();
    const promise = extractTarZst(
      archive,
      path.join(tmpDir, "dest"),
      { type: "gnu", version: "1.34" },
      new RecordingLogger(),
    );

    archive.destroy(
      Object.assign(new Error("socket hang up"), {
        code: "ECONNRESET",
      }),
    );

    await t.throwsAsync(promise, {
      message: /Error while downloading and extracting tar/,
    });
  });
});
