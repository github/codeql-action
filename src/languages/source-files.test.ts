import * as fs from "fs";
import * as path from "path";

import test from "ava";

import { RecordingLogger, setupTests } from "../testing-utils";
import { withTmpDir } from "../util";

import {
  filterLanguagesWithSourceFiles,
  findSourceFileExtensions,
  getExtractorFileExtensions,
} from "./source-files";

setupTests(test);

function writeExtractor(
  extractorRoot: string,
  extractorConfig: string,
): string {
  fs.mkdirSync(extractorRoot, { recursive: true });
  fs.writeFileSync(
    path.join(extractorRoot, "codeql-extractor.yml"),
    extractorConfig,
  );
  return extractorRoot;
}

function writeSourceFile(sourceRoot: string, relativePath: string) {
  const filePath = path.join(sourceRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

test("getExtractorFileExtensions reads all file type extensions", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const extractorRoot = writeExtractor(
      tmpDir,
      [
        "name: ruby",
        "file_types:",
        "  - name: ruby",
        "    extensions: [.rb]",
        "  - name: erb",
        "    extensions: [.ERB]",
      ].join("\n"),
    );
    t.deepEqual(
      getExtractorFileExtensions(extractorRoot, new RecordingLogger(false)),
      [".rb", ".erb"],
    );
  });
});

test("getExtractorFileExtensions ignores data file types", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const extractorRoot = writeExtractor(
      tmpDir,
      [
        "name: javascript",
        "file_types:",
        "  - name: javascript",
        "    extensions: [.js]",
        "  - name: data",
        "    extensions: [.json, .yml]",
      ].join("\n"),
    );
    t.deepEqual(
      getExtractorFileExtensions(extractorRoot, new RecordingLogger(false)),
      [".js"],
    );
  });
});

test("getExtractorFileExtensions returns undefined without file types", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const logger = new RecordingLogger(false);
    t.is(getExtractorFileExtensions(tmpDir, logger), undefined);
    writeExtractor(tmpDir, "name: python");
    t.is(getExtractorFileExtensions(tmpDir, logger), undefined);
  });
});

test("findSourceFileExtensions finds nested files and skips .git", async (t) => {
  await withTmpDir(async (tmpDir) => {
    writeSourceFile(tmpDir, "src/nested/main.PY");
    writeSourceFile(tmpDir, ".git/objects/script.rb");
    t.deepEqual(
      findSourceFileExtensions(tmpDir, new Set([".py", ".rb", ".go"])),
      new Set([".py"]),
    );
  });
});

test("filterLanguagesWithSourceFiles removes languages without source files", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const extractorsDir = path.join(tmpDir, "extractors");
    const sourceRoot = path.join(tmpDir, "source");
    writeSourceFile(sourceRoot, "main.go");
    const extractorRoots = {
      go: writeExtractor(
        path.join(extractorsDir, "go"),
        "file_types:\n  - name: go\n    extensions: [.go]\n",
      ),
      python: writeExtractor(
        path.join(extractorsDir, "python"),
        "file_types:\n  - name: python\n    extensions: [.py]\n",
      ),
      // An extractor without declared file types is always kept.
      swift: writeExtractor(path.join(extractorsDir, "swift"), "name: swift"),
    };
    const logger = new RecordingLogger(false);

    t.deepEqual(
      filterLanguagesWithSourceFiles(
        ["go", "python", "swift", "cpp"],
        extractorRoots,
        sourceRoot,
        logger,
      ),
      ["go", "swift", "cpp"],
    );
    t.true(
      logger.hasMessage(
        "Not analyzing python: the GitHub languages API reported it, but the checkout contains no files with the extensions .py.",
      ),
    );
  });
});
