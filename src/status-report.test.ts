import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { EnvVar } from "./environment";
import { Language } from "./languages";
import { getRunnerLogger } from "./logging";
import { ActionName, createStatusReportBase } from "./status-report";
import {
  setupTests,
  setupActionsVars,
  createTestConfig,
} from "./testing-utils";
import { BuildMode, withTmpDir } from "./util";

setupTests(test);

function setupEnvironmentAndStub(tmpDir: string) {
  setupActionsVars(tmpDir, tmpDir);

  process.env["CODEQL_ACTION_ANALYSIS_KEY"] = "analysis-key";
  process.env["GITHUB_EVENT_NAME"] = "dynamic";
  process.env["GITHUB_REF"] = "refs/heads/main";
  process.env["GITHUB_REPOSITORY"] = "octocat/HelloWorld";
  process.env["GITHUB_RUN_ATTEMPT"] = "2";
  process.env["GITHUB_RUN_ID"] = "100";
  process.env["GITHUB_SHA"] = "a".repeat(40);
  process.env["ImageVersion"] = "2023.05.19.1";
  process.env["RUNNER_OS"] = "macOS";
  process.env["RUNNER_TEMP"] = tmpDir;

  const getRequiredInput = sinon.stub(actionsUtil, "getRequiredInput");
  getRequiredInput.withArgs("matrix").resolves("input/matrix");
}

test("createStatusReportBase", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupEnvironmentAndStub(tmpDir);

    const statusReport = await createStatusReportBase(
      ActionName.Init,
      "failure",
      new Date("May 19, 2023 05:19:00"),
      createTestConfig({
        buildMode: BuildMode.None,
        languages: [Language.java, Language.swift],
      }),
      { numAvailableBytes: 100, numTotalBytes: 500 },
      getRunnerLogger(false),
      "failure cause",
      "exception stack trace",
    );
    t.truthy(statusReport);

    if (statusReport !== undefined) {
      t.is(statusReport.action_name, ActionName.Init);
      t.is(statusReport.action_oid, "unknown");
      t.is(typeof statusReport.action_version, "string");
      t.is(
        statusReport.action_started_at,
        new Date("May 19, 2023 05:19:00").toISOString(),
      );
      t.is(statusReport.actions_event_name, "dynamic");
      t.is(statusReport.analysis_key, "analysis-key");
      t.is(statusReport.build_mode, BuildMode.None);
      t.is(statusReport.cause, "failure cause");
      t.is(statusReport.commit_oid, process.env["GITHUB_SHA"]!);
      t.is(statusReport.exception, "exception stack trace");
      t.is(statusReport.job_name, process.env["GITHUB_JOB"] || "");
      t.is(typeof statusReport.job_run_uuid, "string");
      t.is(statusReport.languages, "java,swift");
      t.is(statusReport.ref, process.env["GITHUB_REF"]!);
      t.is(statusReport.runner_available_disk_space_bytes, 100);
      t.is(statusReport.runner_image_version, process.env["ImageVersion"]);
      t.is(statusReport.runner_os, process.env["RUNNER_OS"]!);
      t.is(statusReport.started_at, process.env[EnvVar.WORKFLOW_STARTED_AT]!);
      t.is(statusReport.status, "failure");
      t.is(statusReport.steady_state_default_setup, false);
      t.is(statusReport.workflow_name, process.env["GITHUB_WORKFLOW"] || "");
      t.is(statusReport.workflow_run_attempt, 2);
      t.is(statusReport.workflow_run_id, 100);
    }
  });
});

test("createStatusReportBase_firstParty", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupEnvironmentAndStub(tmpDir);

    t.is(
      (
        await createStatusReportBase(
          ActionName.UploadSarif,
          "failure",
          new Date("May 19, 2023 05:19:00"),
          createTestConfig({}),
          { numAvailableBytes: 100, numTotalBytes: 500 },
          getRunnerLogger(false),
          "failure cause",
          "exception stack trace",
        )
      )?.first_party_analysis,
      false,
    );

    t.is(
      (
        await createStatusReportBase(
          ActionName.Autobuild,
          "failure",
          new Date("May 19, 2023 05:19:00"),
          createTestConfig({}),
          { numAvailableBytes: 100, numTotalBytes: 500 },
          getRunnerLogger(false),
          "failure cause",
          "exception stack trace",
        )
      )?.first_party_analysis,
      true,
    );

    process.env["CODEQL_ACTION_INIT_HAS_RUN"] = "foobar";
    t.is(
      (
        await createStatusReportBase(
          ActionName.UploadSarif,
          "failure",
          new Date("May 19, 2023 05:19:00"),
          createTestConfig({}),
          { numAvailableBytes: 100, numTotalBytes: 500 },
          getRunnerLogger(false),
          "failure cause",
          "exception stack trace",
        )
      )?.first_party_analysis,
      false,
    );

    t.is(
      (
        await createStatusReportBase(
          ActionName.Init,
          "failure",
          new Date("May 19, 2023 05:19:00"),
          createTestConfig({}),
          { numAvailableBytes: 100, numTotalBytes: 500 },
          getRunnerLogger(false),
          "failure cause",
          "exception stack trace",
        )
      )?.first_party_analysis,
      true,
    );

    process.env["CODEQL_ACTION_INIT_HAS_RUN"] = "true";
    t.is(
      (
        await createStatusReportBase(
          ActionName.UploadSarif,
          "failure",
          new Date("May 19, 2023 05:19:00"),
          createTestConfig({}),
          { numAvailableBytes: 100, numTotalBytes: 500 },
          getRunnerLogger(false),
          "failure cause",
          "exception stack trace",
        )
      )?.first_party_analysis,
      true,
    );

    t.is(
      (
        await createStatusReportBase(
          ActionName.Analyze,
          "failure",
          new Date("May 19, 2023 05:19:00"),
          createTestConfig({}),
          { numAvailableBytes: 100, numTotalBytes: 500 },
          getRunnerLogger(false),
          "failure cause",
          "exception stack trace",
        )
      )?.first_party_analysis,
      true,
    );
  });
});
