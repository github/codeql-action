import * as fs from "fs";
import * as path from "path";

import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import { AnalysisKind, getAnalysisConfig } from "./analyses";
import { getCodeQLForTesting } from "./codeql";
import * as codeql from "./codeql";
import { getRunnerLogger } from "./logging";
import { createFeatures, createTestConfig, setupTests } from "./testing-utils";
import { UploadResult } from "./upload-lib";
import * as uploadLib from "./upload-lib";
import {
  getOrInitCodeQL,
  postProcessAndUploadSarif,
  UploadSarifState,
} from "./upload-sarif";
import * as util from "./util";

setupTests(test);

test("getOrInitCodeQL - gets cached CodeQL instance when available", async (t) => {
  const cachedCodeQL = await getCodeQLForTesting();
  const getCodeQL = sinon.stub(codeql, "getCodeQL").resolves(undefined);
  const minimalInitCodeQL = sinon
    .stub(uploadLib, "minimalInitCodeQL")
    .resolves(undefined);

  const result = await getOrInitCodeQL(
    { cachedCodeQL },
    getRunnerLogger(true),
    { type: util.GitHubVariant.GHES, version: "3.0" },
    createFeatures([]),
    undefined,
  );

  // Neither of the two functions to get a CodeQL instance were called.
  t.true(getCodeQL.notCalled);
  t.true(minimalInitCodeQL.notCalled);

  // But we have an instance that refers to the same object as the one we put into the state.
  t.truthy(result);
  t.is(result, cachedCodeQL);
});

test("getOrInitCodeQL - uses minimalInitCodeQL when there's no config", async (t) => {
  const newInstance = await getCodeQLForTesting();
  const getCodeQL = sinon.stub(codeql, "getCodeQL").resolves(undefined);
  const minimalInitCodeQL = sinon
    .stub(uploadLib, "minimalInitCodeQL")
    .resolves(newInstance);

  const state: UploadSarifState = { cachedCodeQL: undefined };
  const result = await getOrInitCodeQL(
    state,
    getRunnerLogger(true),
    { type: util.GitHubVariant.GHES, version: "3.0" },
    createFeatures([]),
    undefined,
  );

  // Check that the right function was called.
  t.true(getCodeQL.notCalled);
  t.true(minimalInitCodeQL.calledOnce);

  // And that we received the instance that we expected.
  t.truthy(result);
  t.is(result, newInstance);

  // And that it was cached.
  t.is(state.cachedCodeQL, newInstance);
});

test("getOrInitCodeQL - uses getCodeQL when there's a config", async (t) => {
  const newInstance = await getCodeQLForTesting();
  const getCodeQL = sinon.stub(codeql, "getCodeQL").resolves(newInstance);
  const minimalInitCodeQL = sinon
    .stub(uploadLib, "minimalInitCodeQL")
    .resolves(undefined);
  const config = createTestConfig({});

  const state: UploadSarifState = { cachedCodeQL: undefined };
  const result = await getOrInitCodeQL(
    state,
    getRunnerLogger(true),
    { type: util.GitHubVariant.GHES, version: "3.0" },
    createFeatures([]),
    config,
  );

  // Check that the right function was called.
  t.true(getCodeQL.calledOnce);
  t.true(minimalInitCodeQL.notCalled);

  // And that we received the instance that we expected.
  t.truthy(result);
  t.is(result, newInstance);

  // And that it was cached.
  t.is(state.cachedCodeQL, newInstance);
});

interface UploadSarifExpectedResult {
  uploadResult?: UploadResult;
  expectedFiles?: string[];
}

function mockPostProcessSarifFiles() {
  const postProcessSarifFiles = sinon.stub(uploadLib, "postProcessSarifFiles");

  for (const analysisKind of Object.values(AnalysisKind)) {
    const analysisConfig = getAnalysisConfig(analysisKind);
    postProcessSarifFiles
      .withArgs(
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        analysisConfig,
      )
      .resolves({ sarif: { runs: [] }, analysisKey: "", environment: "" });
  }

  return postProcessSarifFiles;
}

const postProcessAndUploadSarifMacro = test.macro({
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

      const postProcessSarifFiles = mockPostProcessSarifFiles();
      const uploadPostProcessedFiles = sinon.stub(
        uploadLib,
        "uploadPostProcessedFiles",
      );

      for (const analysisKind of Object.values(AnalysisKind)) {
        const analysisConfig = getAnalysisConfig(analysisKind);
        uploadPostProcessedFiles
          .withArgs(logger, sinon.match.any, analysisConfig, sinon.match.any)
          .resolves(expectedResult[analysisKind as AnalysisKind]?.uploadResult);
      }

      const fullSarifPaths = sarifFiles.map(toFullPath);
      for (const sarifFile of fullSarifPaths) {
        fs.writeFileSync(sarifFile, "");
      }

      const actual = await postProcessAndUploadSarif(
        logger,
        tempDir,
        features,
        async () => getCodeQLForTesting(),
        "always",
        "",
        testPath,
      );

      for (const analysisKind of Object.values(AnalysisKind)) {
        const analysisKindResult = expectedResult[analysisKind];
        if (analysisKindResult) {
          // We are expecting a result for this analysis kind, check that we have it.
          t.deepEqual(actual[analysisKind], analysisKindResult.uploadResult);
          // Additionally, check that the mocked `postProcessSarifFiles` was called with only the file paths
          // that we expected it to be called with.
          t.assert(
            postProcessSarifFiles.calledWith(
              logger,
              features,
              sinon.match.func,
              tempDir,
              sinon.match.any,
              analysisKindResult.expectedFiles?.map(toFullPath) ??
                fullSarifPaths,
              sinon.match.any,
              getAnalysisConfig(analysisKind),
            ),
          );
        } else {
          // Otherwise, we are not expecting a result for this analysis kind. However, note that `undefined`
          // is also returned by our mocked `uploadProcessedFiles` when there is no expected result for this
          // analysis kind.
          t.is(actual[analysisKind], undefined);
          // Therefore, we also check that the mocked `uploadProcessedFiles` was not called for this analysis kind.
          t.assert(
            !uploadPostProcessedFiles.calledWith(
              logger,
              sinon.match.any,
              getAnalysisConfig(analysisKind),
              sinon.match.any,
            ),
            `uploadProcessedFiles was called for ${analysisKind}, but should not have been.`,
          );
        }
      }
    });
  },
  title: (providedTitle = "") => `processAndUploadSarif - ${providedTitle}`,
});

test(
  "SARIF file",
  postProcessAndUploadSarifMacro,
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
  postProcessAndUploadSarifMacro,
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
  postProcessAndUploadSarifMacro,
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
  postProcessAndUploadSarifMacro,
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
  postProcessAndUploadSarifMacro,
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

test("postProcessAndUploadSarif doesn't upload if upload is disabled", async (t) => {
  await util.withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);
    const features = createFeatures([]);

    const toFullPath = (filename: string) => path.join(tempDir, filename);

    const postProcessSarifFiles = mockPostProcessSarifFiles();
    const uploadPostProcessedFiles = sinon.stub(
      uploadLib,
      "uploadPostProcessedFiles",
    );

    fs.writeFileSync(toFullPath("test.sarif"), "");
    fs.writeFileSync(toFullPath("test.quality.sarif"), "");

    const actual = await postProcessAndUploadSarif(
      logger,
      tempDir,
      features,
      () => getCodeQLForTesting(),
      "never",
      "",
      tempDir,
    );

    t.truthy(actual);
    t.assert(postProcessSarifFiles.calledTwice);
    t.assert(uploadPostProcessedFiles.notCalled);
  });
});

test("postProcessAndUploadSarif writes post-processed SARIF files if output directory is provided", async (t) => {
  await util.withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);
    const features = createFeatures([]);

    const toFullPath = (filename: string) => path.join(tempDir, filename);

    const postProcessSarifFiles = mockPostProcessSarifFiles();

    fs.writeFileSync(toFullPath("test.sarif"), "");
    fs.writeFileSync(toFullPath("test.quality.sarif"), "");

    const postProcessedOutPath = path.join(tempDir, "post-processed");
    const actual = await postProcessAndUploadSarif(
      logger,
      tempDir,
      features,
      () => getCodeQLForTesting(),
      "never",
      "",
      tempDir,
      "",
      postProcessedOutPath,
    );

    t.truthy(actual);
    t.assert(postProcessSarifFiles.calledTwice);
    t.assert(fs.existsSync(path.join(postProcessedOutPath, "upload.sarif")));
    t.assert(
      fs.existsSync(path.join(postProcessedOutPath, "upload.quality.sarif")),
    );
  });
});
