import * as fs from "fs";
import * as path from "path";

import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import { AnalysisKind, getAnalysisConfig } from "./analyses";
import { getRunnerLogger } from "./logging";
import { createFeatures, setupTests } from "./testing-utils";
import { UploadResult } from "./upload-lib";
import * as uploadLib from "./upload-lib";
import { uploadSarif } from "./upload-sarif";
import * as util from "./util";

setupTests(test);

interface UploadSarifExpectedResult {
  uploadResult?: UploadResult;
  expectedFiles?: string[];
}

const uploadSarifMacro = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    sarifFiles: string[],
    sarifPath: (tempDir: string) => string = (tempDir) => tempDir,
    expectedResult: Partial<Record<AnalysisKind, UploadSarifExpectedResult>>,
  ) => {
    await util.withTmpDir(async (tempDir) => {
      const logger = getRunnerLogger(true);
      const testPath = sarifPath(tempDir);
      const features = createFeatures([]);

      const toFullPath = (filename: string) => path.join(tempDir, filename);

      const uploadSpecifiedFiles = sinon.stub(
        uploadLib,
        "uploadSpecifiedFiles",
      );

      for (const analysisKind of Object.values(AnalysisKind)) {
        uploadSpecifiedFiles
          .withArgs(
            sinon.match.any,
            sinon.match.any,
            sinon.match.any,
            features,
            logger,
            getAnalysisConfig(analysisKind),
          )
          .resolves(expectedResult[analysisKind as AnalysisKind]?.uploadResult);
      }

      const fullSarifPaths = sarifFiles.map(toFullPath);
      for (const sarifFile of fullSarifPaths) {
        fs.writeFileSync(sarifFile, "");
      }

      const actual = await uploadSarif(logger, features, "", testPath);

      for (const analysisKind of Object.values(AnalysisKind)) {
        const analysisKindResult = expectedResult[analysisKind];
        if (analysisKindResult) {
          // We are expecting a result for this analysis kind, check that we have it.
          t.deepEqual(actual[analysisKind], analysisKindResult.uploadResult);
          // Additionally, check that the mocked `uploadSpecifiedFiles` was called with only the file paths
          // that we expected it to be called with.
          t.assert(
            uploadSpecifiedFiles.calledWith(
              analysisKindResult.expectedFiles?.map(toFullPath) ??
                fullSarifPaths,
              sinon.match.any,
              sinon.match.any,
              features,
              logger,
              getAnalysisConfig(analysisKind),
            ),
          );
        } else {
          // Otherwise, we are not expecting a result for this analysis kind. However, note that `undefined`
          // is also returned by our mocked `uploadSpecifiedFiles` when there is no expected result for this
          // analysis kind.
          t.is(actual[analysisKind], undefined);
          // Therefore, we also check that the mocked `uploadSpecifiedFiles` was not called for this analysis kind.
          t.assert(
            !uploadSpecifiedFiles.calledWith(
              sinon.match.any,
              sinon.match.any,
              sinon.match.any,
              features,
              logger,
              getAnalysisConfig(analysisKind),
            ),
            `uploadSpecifiedFiles was called for ${analysisKind}, but should not have been.`,
          );
        }
      }
    });
  },
  title: (providedTitle = "") => `uploadSarif - ${providedTitle}`,
});

test(
  "SARIF file",
  uploadSarifMacro,
  ["test.sarif"],
  (tempDir) => path.join(tempDir, "test.sarif"),
  {
    "code-scanning": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-scanning-sarif",
      },
    },
  },
);

test(
  "JSON file",
  uploadSarifMacro,
  ["test.json"],
  (tempDir) => path.join(tempDir, "test.json"),
  {
    "code-scanning": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-scanning-sarif",
      },
    },
  },
);

test(
  "Code Scanning files",
  uploadSarifMacro,
  ["test.json", "test.sarif"],
  undefined,
  {
    "code-scanning": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-scanning-sarif",
      },
      expectedFiles: ["test.sarif"],
    },
  },
);

test(
  "Code Quality file",
  uploadSarifMacro,
  ["test.quality.sarif"],
  (tempDir) => path.join(tempDir, "test.quality.sarif"),
  {
    "code-quality": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-quality-sarif",
      },
    },
  },
);

test(
  "Mixed files",
  uploadSarifMacro,
  ["test.sarif", "test.quality.sarif"],
  undefined,
  {
    "code-scanning": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-scanning-sarif",
      },
      expectedFiles: ["test.sarif"],
    },
    "code-quality": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-quality-sarif",
      },
      expectedFiles: ["test.quality.sarif"],
    },
  },
);
