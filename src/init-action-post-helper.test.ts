import * as core from "@actions/core";
import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { AnalysisKind } from "./analyses";
import * as apiClient from "./api-client";
import * as codeql from "./codeql";
import * as configUtils from "./config-utils";
import * as debugArtifacts from "./debug-artifacts";
import { EnvVar } from "./environment";
import { Feature } from "./feature-flags";
import * as initActionPostHelper from "./init-action-post-helper";
import { getRunnerLogger } from "./logging";
import { OverlayDatabaseMode } from "./overlay";
import * as overlayStatus from "./overlay/status";
import { parseRepositoryNwo } from "./repository";
import {
  createFeatures,
  createTestConfig,
  makeVersionInfo,
  RecordingLogger,
  setupTests,
} from "./testing-utils";
import * as uploadLib from "./upload-lib";
import * as util from "./util";
import * as workflow from "./workflow";

const NUM_BYTES_PER_GIB = 1024 * 1024 * 1024;

setupTests(test);

test("init-post action with debug mode off", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["RUNNER_TEMP"] = tmpDir;

    const gitHubVersion: util.GitHubVersion = {
      type: util.GitHubVariant.DOTCOM,
    };
    sinon.stub(configUtils, "getConfig").resolves(
      createTestConfig({
        debugMode: false,
        gitHubVersion,
        languages: [],
      }),
    );

    const uploadAllAvailableDebugArtifactsSpy = sinon.spy();
    const printDebugLogsSpy = sinon.spy();

    await initActionPostHelper.uploadFailureInfo(
      uploadAllAvailableDebugArtifactsSpy,
      printDebugLogsSpy,
      codeql.createStubCodeQL({}),
      createTestConfig({ debugMode: false }),
      parseRepositoryNwo("github/codeql-action"),
      createFeatures([]),
      getRunnerLogger(true),
    );

    t.assert(uploadAllAvailableDebugArtifactsSpy.notCalled);
    t.assert(printDebugLogsSpy.notCalled);
  });
});

test("init-post action with debug mode on", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["RUNNER_TEMP"] = tmpDir;

    const uploadAllAvailableDebugArtifactsSpy = sinon.spy();
    const printDebugLogsSpy = sinon.spy();

    await initActionPostHelper.uploadFailureInfo(
      uploadAllAvailableDebugArtifactsSpy,
      printDebugLogsSpy,
      codeql.createStubCodeQL({}),
      createTestConfig({ debugMode: true }),
      parseRepositoryNwo("github/codeql-action"),
      createFeatures([]),
      getRunnerLogger(true),
    );

    t.assert(uploadAllAvailableDebugArtifactsSpy.called);
    t.assert(printDebugLogsSpy.called);
  });
});

test("uploads failed SARIF run with `diagnostics export` if feature flag is off", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v5",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v4",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v4",
      with: {
        category: "my-category",
      },
    },
  ]);
  await testFailedSarifUpload(t, actionsWorkflow, { category: "my-category" });
});

test("uploads failed SARIF run with `diagnostics export` if the database doesn't exist", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v5",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v4",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v4",
      with: {
        category: "my-category",
      },
    },
  ]);
  await testFailedSarifUpload(t, actionsWorkflow, {
    category: "my-category",
    databaseExists: false,
  });
});

test("uploads failed SARIF run with database export-diagnostics if the database exists and feature flag is on", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v5",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v4",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v4",
      with: {
        category: "my-category",
      },
    },
  ]);
  await testFailedSarifUpload(t, actionsWorkflow, {
    category: "my-category",
    exportDiagnosticsEnabled: true,
  });
});

const UPLOAD_INPUT_TEST_CASES = [
  {
    uploadInput: "true",
    shouldUpload: true,
  },
  {
    uploadInput: "false",
    shouldUpload: true,
  },
  {
    uploadInput: "always",
    shouldUpload: true,
  },
  {
    uploadInput: "failure-only",
    shouldUpload: true,
  },
  {
    uploadInput: "never",
    shouldUpload: false,
  },
  {
    uploadInput: "unrecognized-value",
    shouldUpload: true,
  },
];

for (const { uploadInput, shouldUpload } of UPLOAD_INPUT_TEST_CASES) {
  test(`does ${
    shouldUpload ? "" : "not "
  }upload failed SARIF run for workflow with upload: ${uploadInput}`, async (t) => {
    const actionsWorkflow = createTestWorkflow([
      {
        name: "Checkout repository",
        uses: "actions/checkout@v5",
      },
      {
        name: "Initialize CodeQL",
        uses: "github/codeql-action/init@v4",
        with: {
          languages: "javascript",
        },
      },
      {
        name: "Perform CodeQL Analysis",
        uses: "github/codeql-action/analyze@v4",
        with: {
          category: "my-category",
          upload: uploadInput,
        },
      },
    ]);
    const result = await testFailedSarifUpload(t, actionsWorkflow, {
      category: "my-category",
      expectUpload: shouldUpload,
    });
    if (!shouldUpload) {
      t.is(
        result.upload_failed_run_skipped_because,
        "SARIF upload is disabled",
      );
    }
  });
}

test("uploading failed SARIF run succeeds when workflow uses an input with a matrix var", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v5",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v4",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v4",
      with: {
        category: "/language:${{ matrix.language }}",
      },
    },
  ]);
  await testFailedSarifUpload(t, actionsWorkflow, {
    category: "/language:csharp",
    matrix: { language: "csharp" },
  });
});

test("uploading failed SARIF run fails when workflow uses a complex upload input", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v5",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v4",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v4",
      with: {
        upload: "${{ matrix.language != 'csharp' }}",
      },
    },
  ]);
  const result = await testFailedSarifUpload(t, actionsWorkflow, {
    expectUpload: false,
  });
  t.is(
    result.upload_failed_run_error,
    "Could not get upload input to github/codeql-action/analyze since it contained an " +
      "unrecognized dynamic value.",
  );
});

test("uploading failed SARIF run fails when workflow does not reference github/codeql-action", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v5",
    },
  ]);
  const result = await testFailedSarifUpload(t, actionsWorkflow, {
    expectUpload: false,
  });
  t.is(
    result.upload_failed_run_error,
    "Could not get upload input to github/codeql-action/analyze since the analyze job does not " +
      "call github/codeql-action/analyze.",
  );
  t.truthy(result.upload_failed_run_stack_trace);
});

test("not uploading failed SARIF when `code-scanning` is not an enabled analysis kind", async (t) => {
  const result = await testFailedSarifUpload(t, createTestWorkflow([]), {
    analysisKinds: [AnalysisKind.CodeQuality],
    expectUpload: false,
  });
  t.is(
    result.upload_failed_run_skipped_because,
    "No analysis kind that supports failed SARIF uploads is enabled.",
  );
});

test("saves overlay status when overlay-base analysis did not complete successfully", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["RUNNER_TEMP"] = tmpDir;
    // Ensure analyze did not complete successfully.
    delete process.env[EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY];

    const diskUsage: util.DiskUsage = {
      numAvailableBytes: 100 * NUM_BYTES_PER_GIB,
      numTotalBytes: 200 * NUM_BYTES_PER_GIB,
    };
    sinon.stub(util, "checkDiskUsage").resolves(diskUsage);

    const saveOverlayStatusStub = sinon
      .stub(overlayStatus, "saveOverlayStatus")
      .resolves(true);

    const stubCodeQL = codeql.createStubCodeQL({});

    await initActionPostHelper.uploadFailureInfo(
      sinon.spy(),
      sinon.spy(),
      stubCodeQL,
      createTestConfig({
        debugMode: false,
        languages: ["javascript"],
        overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
      }),
      parseRepositoryNwo("github/codeql-action"),
      createFeatures([Feature.OverlayAnalysisStatusSave]),
      getRunnerLogger(true),
    );

    t.true(
      saveOverlayStatusStub.calledOnce,
      "saveOverlayStatus should be called exactly once",
    );
    t.deepEqual(
      saveOverlayStatusStub.firstCall.args[0],
      stubCodeQL,
      "first arg should be the CodeQL instance",
    );
    t.deepEqual(
      saveOverlayStatusStub.firstCall.args[1],
      ["javascript"],
      "second arg should be the languages",
    );
    t.deepEqual(
      saveOverlayStatusStub.firstCall.args[2],
      diskUsage,
      "third arg should be the disk usage",
    );
    t.deepEqual(
      saveOverlayStatusStub.firstCall.args[3],
      {
        attemptedToBuildOverlayBaseDatabase: true,
        builtOverlayBaseDatabase: false,
      },
      "fourth arg should be the overlay status recording an unsuccessful build attempt",
    );
  });
});

test("does not save overlay status when OverlayAnalysisStatusSave feature flag is disabled", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["RUNNER_TEMP"] = tmpDir;
    // Ensure analyze did not complete successfully.
    delete process.env[EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY];

    sinon.stub(util, "checkDiskUsage").resolves({
      numAvailableBytes: 100 * NUM_BYTES_PER_GIB,
      numTotalBytes: 200 * NUM_BYTES_PER_GIB,
    });

    const saveOverlayStatusStub = sinon
      .stub(overlayStatus, "saveOverlayStatus")
      .resolves(true);

    await initActionPostHelper.uploadFailureInfo(
      sinon.spy(),
      sinon.spy(),
      codeql.createStubCodeQL({}),
      createTestConfig({
        debugMode: false,
        languages: ["javascript"],
        overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
      }),
      parseRepositoryNwo("github/codeql-action"),
      createFeatures([]),
      getRunnerLogger(true),
    );

    t.true(
      saveOverlayStatusStub.notCalled,
      "saveOverlayStatus should not be called when OverlayAnalysisStatusSave feature flag is disabled",
    );
  });
});

test("does not save overlay status when build successful", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["RUNNER_TEMP"] = tmpDir;
    // Mark analyze as having completed successfully.
    process.env[EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY] = "true";

    sinon.stub(util, "checkDiskUsage").resolves({
      numAvailableBytes: 100 * NUM_BYTES_PER_GIB,
      numTotalBytes: 200 * NUM_BYTES_PER_GIB,
    });

    const saveOverlayStatusStub = sinon
      .stub(overlayStatus, "saveOverlayStatus")
      .resolves(true);

    await initActionPostHelper.uploadFailureInfo(
      sinon.spy(),
      sinon.spy(),
      codeql.createStubCodeQL({}),
      createTestConfig({
        debugMode: false,
        languages: ["javascript"],
        overlayDatabaseMode: OverlayDatabaseMode.OverlayBase,
      }),
      parseRepositoryNwo("github/codeql-action"),
      createFeatures([Feature.OverlayAnalysisStatusSave]),
      getRunnerLogger(true),
    );

    t.true(
      saveOverlayStatusStub.notCalled,
      "saveOverlayStatus should not be called when build completed successfully",
    );
  });
});

test("does not save overlay status when overlay not enabled", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["RUNNER_TEMP"] = tmpDir;
    delete process.env[EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY];

    sinon.stub(util, "checkDiskUsage").resolves({
      numAvailableBytes: 100 * NUM_BYTES_PER_GIB,
      numTotalBytes: 200 * NUM_BYTES_PER_GIB,
    });

    const saveOverlayStatusStub = sinon
      .stub(overlayStatus, "saveOverlayStatus")
      .resolves(true);

    await initActionPostHelper.uploadFailureInfo(
      sinon.spy(),
      sinon.spy(),
      codeql.createStubCodeQL({}),
      createTestConfig({
        debugMode: false,
        languages: ["javascript"],
        overlayDatabaseMode: OverlayDatabaseMode.None,
      }),
      parseRepositoryNwo("github/codeql-action"),
      createFeatures([]),
      getRunnerLogger(true),
    );

    t.true(
      saveOverlayStatusStub.notCalled,
      "saveOverlayStatus should not be called when overlay is not enabled",
    );
  });
});

function createTestWorkflow(
  steps: workflow.WorkflowJobStep[],
): workflow.Workflow {
  return {
    name: "CodeQL",
    on: {
      push: {
        branches: ["main"],
      },
      pull_request: {
        branches: ["main"],
      },
    },
    jobs: {
      analyze: {
        name: "CodeQL Analysis",
        "runs-on": "ubuntu-latest",
        steps,
      },
    },
  };
}

async function testFailedSarifUpload(
  t: ExecutionContext<unknown>,
  actionsWorkflow: workflow.Workflow,
  {
    category,
    databaseExists = true,
    expectUpload = true,
    exportDiagnosticsEnabled = false,
    matrix = {},
    analysisKinds = [AnalysisKind.CodeScanning],
  }: {
    category?: string;
    databaseExists?: boolean;
    expectUpload?: boolean;
    exportDiagnosticsEnabled?: boolean;
    matrix?: { [key: string]: string };
    analysisKinds?: AnalysisKind[];
  } = {},
): Promise<initActionPostHelper.UploadFailedSarifResult> {
  const config = createTestConfig({
    analysisKinds,
    codeQLCmd: "codeql",
    debugMode: true,
    languages: [],
  });
  if (databaseExists) {
    config.dbLocation = "path/to/database";
  }
  process.env["GITHUB_JOB"] = "analyze";
  process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
  process.env["GITHUB_WORKSPACE"] =
    "/home/runner/work/codeql-action/codeql-action";
  sinon
    .stub(actionsUtil, "getRequiredInput")
    .withArgs("matrix")
    .returns(JSON.stringify(matrix));

  const codeqlObject = await codeql.getCodeQLForTesting();
  sinon.stub(codeql, "getCodeQL").resolves(codeqlObject);
  sinon.stub(codeqlObject, "getVersion").resolves(makeVersionInfo("2.17.6"));
  const databaseExportDiagnosticsStub = sinon.stub(
    codeqlObject,
    "databaseExportDiagnostics",
  );
  const diagnosticsExportStub = sinon.stub(codeqlObject, "diagnosticsExport");

  sinon.stub(workflow, "getWorkflow").resolves(actionsWorkflow);

  const uploadFiles = sinon.stub(uploadLib, "uploadFiles");
  uploadFiles.resolves({
    sarifID: "42",
    statusReport: { raw_upload_size_bytes: 20, zipped_upload_size_bytes: 10 },
  } as uploadLib.UploadResult);
  const waitForProcessing = sinon.stub(uploadLib, "waitForProcessing");

  const features = [] as Feature[];
  if (exportDiagnosticsEnabled) {
    features.push(Feature.ExportDiagnosticsEnabled);
  }

  const result = await initActionPostHelper.tryUploadSarifIfRunFailed(
    config,
    parseRepositoryNwo("github/codeql-action"),
    createFeatures(features),
    getRunnerLogger(true),
  );
  if (expectUpload) {
    t.deepEqual(result, {
      sarifID: "42",
      raw_upload_size_bytes: 20,
      zipped_upload_size_bytes: 10,
    });
    if (databaseExists && exportDiagnosticsEnabled) {
      t.true(
        databaseExportDiagnosticsStub.calledOnceWith(
          config.dbLocation,
          sinon.match.string,
          category,
        ),
        `Actual args were: ${JSON.stringify(databaseExportDiagnosticsStub.args)}`,
      );
    } else {
      t.true(
        diagnosticsExportStub.calledOnceWith(
          sinon.match.string,
          category,
          config,
        ),
        `Actual args were: ${JSON.stringify(diagnosticsExportStub.args)}`,
      );
    }
    t.true(
      uploadFiles.calledOnceWith(
        sinon.match.string,
        sinon.match.string,
        category,
        sinon.match.any,
        sinon.match.any,
      ),
      `Actual args were: ${JSON.stringify(uploadFiles.args)}`,
    );
    t.true(
      waitForProcessing.calledOnceWith(sinon.match.any, "42", sinon.match.any, {
        isUnsuccessfulExecution: true,
      }),
    );
  } else {
    t.true(diagnosticsExportStub.notCalled);
    t.true(uploadFiles.notCalled);
    t.true(waitForProcessing.notCalled);
  }
  return result;
}

const singleLanguageMatrix = JSON.stringify({
  language: "javascript",
  category: "/language:javascript",
  "build-mode": "none",
  runner: "ubuntu-latest",
});

async function mockRiskAssessmentEnv(matrix: string) {
  process.env[EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY] = "false";
  process.env["GITHUB_JOB"] = "analyze";
  process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
  process.env["GITHUB_WORKSPACE"] =
    "/home/runner/work/codeql-action-fake-repository/codeql-action-fake-repository";

  sinon
    .stub(apiClient, "getGitHubVersion")
    .resolves({ type: util.GitHubVariant.GHES, version: "3.0.0" });

  const codeqlObject = await codeql.getCodeQLForTesting();
  const databaseExportDiagnostics = sinon
    .stub(codeqlObject, "databaseExportDiagnostics")
    .resolves();
  const diagnosticsExport = sinon
    .stub(codeqlObject, "diagnosticsExport")
    .resolves();

  sinon.stub(codeql, "getCodeQL").resolves(codeqlObject);

  sinon.stub(core, "getInput").withArgs("matrix").returns(matrix);

  const uploadArtifact = sinon.stub().resolves();
  const artifactClient = { uploadArtifact };
  sinon
    .stub(debugArtifacts, "getArtifactUploaderClient")
    .value(() => artifactClient);

  return { uploadArtifact, databaseExportDiagnostics, diagnosticsExport };
}

test("tryUploadSarifIfRunFailed - uploads as artifact for risk assessments (diagnosticsExport)", async (t) => {
  const logger = new RecordingLogger();
  const { uploadArtifact, databaseExportDiagnostics, diagnosticsExport } =
    await mockRiskAssessmentEnv(singleLanguageMatrix);

  const config = createTestConfig({
    analysisKinds: [AnalysisKind.RiskAssessment],
    codeQLCmd: "codeql-for-testing",
    languages: ["javascript"],
  });
  const features = createFeatures([]);

  const result = await initActionPostHelper.tryUploadSarifIfRunFailed(
    config,
    parseRepositoryNwo("github/codeql-action-fake-repository"),
    features,
    logger,
  );

  const expectedName = debugArtifacts.sanitizeArtifactName(
    `sarif-artifact-${debugArtifacts.getArtifactSuffix(singleLanguageMatrix)}`,
  );
  const expectedFilePattern = /codeql-failed-sarif-javascript\.csra\.sarif$/;
  t.is(result.upload_failed_run_skipped_because, undefined);
  t.is(result.upload_failed_run_error, undefined);
  t.is(result.sarifID, expectedName);
  t.assert(
    uploadArtifact.calledOnceWith(
      expectedName,
      [sinon.match(expectedFilePattern)],
      sinon.match.string,
    ),
  );
  t.assert(databaseExportDiagnostics.notCalled);
  t.assert(
    diagnosticsExport.calledOnceWith(
      sinon.match(expectedFilePattern),
      "/language:javascript",
      config,
    ),
  );
});

test("tryUploadSarifIfRunFailed - uploads as artifact for risk assessments (databaseExportDiagnostics)", async (t) => {
  const logger = new RecordingLogger();
  const { uploadArtifact, databaseExportDiagnostics, diagnosticsExport } =
    await mockRiskAssessmentEnv(singleLanguageMatrix);

  const dbLocation = "/some/path";
  const config = createTestConfig({
    analysisKinds: [AnalysisKind.RiskAssessment],
    codeQLCmd: "codeql-for-testing",
    languages: ["javascript"],
    dbLocation: "/some/path",
  });
  const features = createFeatures([Feature.ExportDiagnosticsEnabled]);

  const result = await initActionPostHelper.tryUploadSarifIfRunFailed(
    config,
    parseRepositoryNwo("github/codeql-action-fake-repository"),
    features,
    logger,
  );

  const expectedName = debugArtifacts.sanitizeArtifactName(
    `sarif-artifact-${debugArtifacts.getArtifactSuffix(singleLanguageMatrix)}`,
  );
  const expectedFilePattern = /codeql-failed-sarif-javascript\.csra\.sarif$/;
  t.is(result.upload_failed_run_skipped_because, undefined);
  t.is(result.upload_failed_run_error, undefined);
  t.is(result.sarifID, expectedName);
  t.assert(
    uploadArtifact.calledOnceWith(
      expectedName,
      [sinon.match(expectedFilePattern)],
      sinon.match.string,
    ),
  );
  t.assert(diagnosticsExport.notCalled);
  t.assert(
    databaseExportDiagnostics.calledOnceWith(
      dbLocation,
      sinon.match(expectedFilePattern),
      "/language:javascript",
    ),
  );
});

const skippedUploadTest = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    config: Partial<configUtils.Config>,
    expectedSkippedReason: string,
  ) => {
    const logger = new RecordingLogger();
    const { uploadArtifact, diagnosticsExport } =
      await mockRiskAssessmentEnv(singleLanguageMatrix);
    const features = createFeatures([]);

    const result = await initActionPostHelper.tryUploadSarifIfRunFailed(
      createTestConfig(config),
      parseRepositoryNwo("github/codeql-action-fake-repository"),
      features,
      logger,
    );

    t.is(result.upload_failed_run_skipped_because, expectedSkippedReason);
    t.assert(uploadArtifact.notCalled);
    t.assert(diagnosticsExport.notCalled);
  },

  title: (providedTitle: string = "") =>
    `tryUploadSarifIfRunFailed - skips upload ${providedTitle}`,
});

test(
  "without CodeQL command",
  skippedUploadTest,
  // No codeQLCmd
  {
    analysisKinds: [AnalysisKind.RiskAssessment],
    languages: ["javascript"],
  } satisfies Partial<configUtils.Config>,
  "CodeQL command not found",
);

test(
  "if no language is configured",
  skippedUploadTest,
  // No explicit language configuration
  {
    analysisKinds: [AnalysisKind.RiskAssessment],
    codeQLCmd: "codeql-for-testing",
  } satisfies Partial<configUtils.Config>,
  "Unexpectedly, the configuration is not for a single language.",
);

test(
  "if multiple languages is configured",
  skippedUploadTest,
  // Multiple explicit languages configured
  {
    analysisKinds: [AnalysisKind.RiskAssessment],
    codeQLCmd: "codeql-for-testing",
    languages: ["javascript", "python"],
  } satisfies Partial<configUtils.Config>,
  "Unexpectedly, the configuration is not for a single language.",
);
