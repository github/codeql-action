import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as codeql from "./codeql";
import * as configUtils from "./config-utils";
import { Feature } from "./feature-flags";
import * as initActionPostHelper from "./init-action-post-helper";
import { getRunnerLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { createFeatures, setupTests } from "./testing-utils";
import * as uploadLib from "./upload-lib";
import * as util from "./util";
import * as workflow from "./workflow";

setupTests(test);

test("post: init action with debug mode off", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["RUNNER_TEMP"] = tmpDir;

    const gitHubVersion: util.GitHubVersion = {
      type: util.GitHubVariant.DOTCOM,
    };
    sinon.stub(configUtils, "getConfig").resolves({
      debugMode: false,
      gitHubVersion,
      languages: [],
      packs: [],
    } as unknown as configUtils.Config);

    const uploadDatabaseBundleSpy = sinon.spy();
    const uploadLogsSpy = sinon.spy();
    const printDebugLogsSpy = sinon.spy();

    await initActionPostHelper.run(
      uploadDatabaseBundleSpy,
      uploadLogsSpy,
      printDebugLogsSpy,
      parseRepositoryNwo("github/codeql-action"),
      createFeatures([]),
      getRunnerLogger(true)
    );

    t.assert(uploadDatabaseBundleSpy.notCalled);
    t.assert(uploadLogsSpy.notCalled);
    t.assert(printDebugLogsSpy.notCalled);
  });
});

test("post: init action with debug mode on", async (t) => {
  return await util.withTmpDir(async (tmpDir) => {
    process.env["GITHUB_REPOSITORY"] = "github/codeql-action-fake-repository";
    process.env["RUNNER_TEMP"] = tmpDir;

    const gitHubVersion: util.GitHubVersion = {
      type: util.GitHubVariant.DOTCOM,
    };
    sinon.stub(configUtils, "getConfig").resolves({
      debugMode: true,
      gitHubVersion,
      languages: [],
      packs: [],
    } as unknown as configUtils.Config);

    const uploadDatabaseBundleSpy = sinon.spy();
    const uploadLogsSpy = sinon.spy();
    const printDebugLogsSpy = sinon.spy();

    await initActionPostHelper.run(
      uploadDatabaseBundleSpy,
      uploadLogsSpy,
      printDebugLogsSpy,
      parseRepositoryNwo("github/codeql-action"),
      createFeatures([]),
      getRunnerLogger(true)
    );

    t.assert(uploadDatabaseBundleSpy.called);
    t.assert(uploadLogsSpy.called);
    t.assert(printDebugLogsSpy.called);
  });
});

test("uploads failed SARIF run with `diagnostics export` if feature flag is off", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v3",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v2",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v2",
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
      uses: "actions/checkout@v3",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v2",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v2",
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
      uses: "actions/checkout@v3",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v2",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v2",
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

test("uploads failed SARIF run for workflow with upload: failure-only", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v3",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v2",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v2",
      with: {
        category: "my-category",
        upload: "failure-only",
      },
    },
  ]);
  await testFailedSarifUpload(t, actionsWorkflow, {
    category: "my-category",
  });
});

test("uploading failed SARIF run fails for workflow with upload: never", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v3",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v2",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v2",
      with: {
        category: "my-category",
        upload: "never",
      },
    },
  ]);
  const result = await testFailedSarifUpload(t, actionsWorkflow, {
    expectUpload: false,
  });
  t.is(result.upload_failed_run_skipped_because, "SARIF upload is disabled");
});

test("uploading failed SARIF run fails for workflow with unrecognized upload input", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v3",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v2",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v2",
      with: {
        category: "my-category",
        upload: "unrecognized string",
      },
    },
  ]);
  const result = await testFailedSarifUpload(t, actionsWorkflow, {
    expectUpload: false,
  });
  t.is(result.upload_failed_run_skipped_because, "SARIF upload is disabled");
});

test("uploading failed SARIF run succeeds when workflow uses an input with a matrix var", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v3",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v2",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v2",
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
      uses: "actions/checkout@v3",
    },
    {
      name: "Initialize CodeQL",
      uses: "github/codeql-action/init@v2",
      with: {
        languages: "javascript",
      },
    },
    {
      name: "Perform CodeQL Analysis",
      uses: "github/codeql-action/analyze@v2",
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
      "unrecognized dynamic value."
  );
});

test("uploading failed SARIF run fails when workflow does not reference github/codeql-action", async (t) => {
  const actionsWorkflow = createTestWorkflow([
    {
      name: "Checkout repository",
      uses: "actions/checkout@v3",
    },
  ]);
  const result = await testFailedSarifUpload(t, actionsWorkflow, {
    expectUpload: false,
  });
  t.is(
    result.upload_failed_run_error,
    "Could not get upload input to github/codeql-action/analyze since the analyze job does not " +
      "call github/codeql-action/analyze."
  );
  t.truthy(result.upload_failed_run_stack_trace);
});

function createTestWorkflow(
  steps: workflow.WorkflowJobStep[]
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
    exportDiagnosticsEnabled = false,
    expectUpload = true,
    matrix = {},
  }: {
    category?: string;
    databaseExists?: boolean;
    exportDiagnosticsEnabled?: boolean;
    expectUpload?: boolean;

    matrix?: { [key: string]: string };
  } = {}
): Promise<initActionPostHelper.UploadFailedSarifResult> {
  const config = {
    codeQLCmd: "codeql",
    debugMode: true,
    languages: [],
    packs: [],
  } as unknown as configUtils.Config;
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
  const databaseExportDiagnosticsStub = sinon.stub(
    codeqlObject,
    "databaseExportDiagnostics"
  );
  const diagnosticsExportStub = sinon.stub(codeqlObject, "diagnosticsExport");

  sinon.stub(workflow, "getWorkflow").resolves(actionsWorkflow);

  const uploadFromActions = sinon.stub(uploadLib, "uploadFromActions");
  uploadFromActions.resolves({
    sarifID: "42",
    statusReport: { raw_upload_size_bytes: 20, zipped_upload_size_bytes: 10 },
  } as uploadLib.UploadResult);
  const waitForProcessing = sinon.stub(uploadLib, "waitForProcessing");

  const features = [Feature.UploadFailedSarifEnabled];
  if (exportDiagnosticsEnabled) {
    features.push(Feature.ExportDiagnosticsEnabled);
  }

  const result = await initActionPostHelper.tryUploadSarifIfRunFailed(
    config,
    parseRepositoryNwo("github/codeql-action"),
    createFeatures(features),
    getRunnerLogger(true)
  );
  if (expectUpload) {
    t.deepEqual(result, {
      raw_upload_size_bytes: 20,
      zipped_upload_size_bytes: 10,
    });
  }
  if (expectUpload) {
    if (databaseExists && exportDiagnosticsEnabled) {
      t.true(
        databaseExportDiagnosticsStub.calledOnceWith(
          config.dbLocation,
          sinon.match.string,
          category
        ),
        `Actual args were: ${databaseExportDiagnosticsStub.args}`
      );
    } else {
      t.true(
        diagnosticsExportStub.calledOnceWith(
          sinon.match.string,
          category,
          config,
          sinon.match.any
        ),
        `Actual args were: ${diagnosticsExportStub.args}`
      );
    }
    t.true(
      uploadFromActions.calledOnceWith(
        sinon.match.string,
        sinon.match.string,
        category,
        sinon.match.any
      ),
      `Actual args were: ${uploadFromActions.args}`
    );
    t.true(
      waitForProcessing.calledOnceWith(sinon.match.any, "42", sinon.match.any, {
        isUnsuccessfulExecution: true,
      })
    );
  } else {
    t.true(diagnosticsExportStub.notCalled);
    t.true(uploadFromActions.notCalled);
    t.true(waitForProcessing.notCalled);
  }
  return result;
}
