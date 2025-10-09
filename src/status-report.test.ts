import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import { Config } from "./config-utils";
import { EnvVar } from "./environment";
import { KnownLanguage } from "./languages";
import { getRunnerLogger } from "./logging";
import { ToolsSource } from "./setup-codeql";
import {
  ActionName,
  createInitWithConfigStatusReport,
  createStatusReportBase,
  getActionsStatus,
  InitStatusReport,
  InitWithConfigStatusReport,
} from "./status-report";
import {
  setupTests,
  setupActionsVars,
  createTestConfig,
} from "./testing-utils";
import { BuildMode, ConfigurationError, withTmpDir, wrapError } from "./util";

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
        languages: [KnownLanguage.java, KnownLanguage.swift],
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

test("createStatusReportBase - empty configuration", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupEnvironmentAndStub(tmpDir);

    const statusReport = await createStatusReportBase(
      ActionName.StartProxy,
      "success",
      new Date("May 19, 2023 05:19:00"),
      {},
      { numAvailableBytes: 100, numTotalBytes: 500 },
      getRunnerLogger(false),
    );

    if (t.truthy(statusReport)) {
      t.is(statusReport.action_name, ActionName.StartProxy);
      t.is(statusReport.status, "success");
    }
  });
});

test("createStatusReportBase - partial configuration", async (t) => {
  await withTmpDir(async (tmpDir: string) => {
    setupEnvironmentAndStub(tmpDir);

    const statusReport = await createStatusReportBase(
      ActionName.StartProxy,
      "success",
      new Date("May 19, 2023 05:19:00"),
      {
        languages: ["go"],
      },
      { numAvailableBytes: 100, numTotalBytes: 500 },
      getRunnerLogger(false),
    );

    if (t.truthy(statusReport)) {
      t.is(statusReport.action_name, ActionName.StartProxy);
      t.is(statusReport.status, "success");
      t.is(statusReport.languages, "go");
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

test("getActionStatus handling correctly various types of errors", (t) => {
  t.is(
    getActionsStatus(new Error("arbitrary error")),
    "failure",
    "We categorise an arbitrary error as a failure",
  );

  t.is(
    getActionsStatus(new ConfigurationError("arbitrary error")),
    "user-error",
    "We categorise a ConfigurationError as a user error",
  );

  t.is(
    getActionsStatus(new Error("exit code 1"), "multiple things went wrong"),
    "failure",
    "getActionsStatus should return failure if passed an arbitrary error and an additional failure cause",
  );

  t.is(
    getActionsStatus(
      new ConfigurationError("exit code 1"),
      "multiple things went wrong",
    ),
    "user-error",
    "getActionsStatus should return user-error if passed a configuration error and an additional failure cause",
  );

  t.is(
    getActionsStatus(),
    "success",
    "getActionsStatus should return success if no error is passed",
  );

  t.is(
    getActionsStatus(new Object()),
    "failure",
    "getActionsStatus should return failure if passed an arbitrary object",
  );

  t.is(
    getActionsStatus(null, "an error occurred"),
    "failure",
    "getActionsStatus should return failure if passed null and an additional failure cause",
  );

  t.is(
    getActionsStatus(wrapError(new ConfigurationError("arbitrary error"))),
    "user-error",
    "We still recognise a wrapped ConfigurationError as a user error",
  );
});

const testCreateInitWithConfigStatusReport = test.macro({
  exec: async (
    t,
    _title: string,
    config: Config,
    expectedReportProperties: Partial<InitWithConfigStatusReport>,
  ) => {
    await withTmpDir(async (tmpDir: string) => {
      setupEnvironmentAndStub(tmpDir);

      const statusReportBase = await createStatusReportBase(
        ActionName.Init,
        "failure",
        new Date("May 19, 2023 05:19:00"),
        config,
        { numAvailableBytes: 100, numTotalBytes: 500 },
        getRunnerLogger(false),
        "failure cause",
        "exception stack trace",
      );

      if (t.truthy(statusReportBase)) {
        const initStatusReport: InitStatusReport = {
          ...statusReportBase,
          tools_input: "",
          tools_resolved_version: "foo",
          tools_source: ToolsSource.Unknown,
          workflow_languages: "actions",
        };

        const initWithConfigStatusReport =
          await createInitWithConfigStatusReport(
            config,
            initStatusReport,
            undefined,
            1024,
            undefined,
            undefined,
          );

        if (t.truthy(initWithConfigStatusReport)) {
          t.like(initWithConfigStatusReport, expectedReportProperties);
        }
      }
    });
  },
  title: (_, title) => `createInitWithConfigStatusReport: ${title}`,
});

test(
  testCreateInitWithConfigStatusReport,
  "returns a value",
  createTestConfig({
    buildMode: BuildMode.None,
    languages: [KnownLanguage.java, KnownLanguage.swift],
  }),
  {
    trap_cache_download_size_bytes: 1024,
    registries: "[]",
    query_filters: "[]",
    packs: "{}",
  },
);

test(
  testCreateInitWithConfigStatusReport,
  "includes packs for a single language",
  createTestConfig({
    buildMode: BuildMode.None,
    languages: [KnownLanguage.java],
    computedConfig: {
      packs: ["foo", "bar"],
    },
  }),
  {
    registries: "[]",
    query_filters: "[]",
    packs: JSON.stringify({ java: ["foo", "bar"] }),
  },
);

test(
  testCreateInitWithConfigStatusReport,
  "includes packs for multiple languages",
  createTestConfig({
    buildMode: BuildMode.None,
    languages: [KnownLanguage.java, KnownLanguage.swift],
    computedConfig: {
      packs: { java: ["java-foo", "java-bar"], swift: ["swift-bar"] },
    },
  }),
  {
    registries: "[]",
    query_filters: "[]",
    packs: JSON.stringify({
      java: ["java-foo", "java-bar"],
      swift: ["swift-bar"],
    }),
  },
);
