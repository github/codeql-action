import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { EnvVar } from "./environment";
import { createStatusReportBase } from "./status-report";
import { setupTests, setupActionsVars } from "./testing-utils";
import { withTmpDir } from "./util";

setupTests(test);

test("createStatusReportBase", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupActionsVars(tmpDir, tmpDir);

    process.env["CODEQL_ACTION_ANALYSIS_KEY"] = "analysis-key";
    process.env["GITHUB_REF"] = "refs/heads/main";
    process.env["GITHUB_REPOSITORY"] = "octocat/HelloWorld";
    process.env["GITHUB_RUN_ATTEMPT"] = "2";
    process.env["GITHUB_RUN_ID"] = "100";
    process.env["GITHUB_SHA"] = "a".repeat(40);
    process.env["ImageVersion"] = "2023.05.19.1";
    process.env["RUNNER_OS"] = "macOS";

    const getRequiredInput = sinon.stub(actionsUtil, "getRequiredInput");
    getRequiredInput.withArgs("matrix").resolves("input/matrix");

    const statusReport = await createStatusReportBase(
      "init",
      "failure",
      new Date("May 19, 2023 05:19:00"),
      { numAvailableBytes: 100, numTotalBytes: 500 },
      "failure cause",
      "exception stack trace",
    );

    t.is(statusReport.action_name, "init");
    t.is(statusReport.action_oid, "unknown");
    t.is(typeof statusReport.action_version, "string");
    t.is(
      statusReport.action_started_at,
      new Date("May 19, 2023 05:19:00").toISOString(),
    );
    t.is(statusReport.analysis_key, "analysis-key");
    t.is(statusReport.cause, "failure cause");
    t.is(statusReport.commit_oid, process.env["GITHUB_SHA"]);
    t.is(statusReport.exception, "exception stack trace");
    t.is(statusReport.job_name, process.env["GITHUB_JOB"] || "");
    t.is(typeof statusReport.job_run_uuid, "string");
    t.is(statusReport.ref, process.env["GITHUB_REF"]);
    t.is(statusReport.runner_available_disk_space_bytes, 100);
    t.is(statusReport.runner_image_version, process.env["ImageVersion"]);
    t.is(statusReport.runner_os, process.env["RUNNER_OS"]);
    t.is(statusReport.started_at, process.env[EnvVar.WORKFLOW_STARTED_AT]!);
    t.is(statusReport.status, "failure");
    t.is(statusReport.workflow_name, process.env["GITHUB_WORKFLOW"] || "");
    t.is(statusReport.workflow_run_attempt, 2);
    t.is(statusReport.workflow_run_id, 100);
  });
});
