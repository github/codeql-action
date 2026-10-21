import * as core from "@actions/core";
import test from "ava";
import sinon from "sinon";

import * as common from "./action-common";
import * as actionsUtil from "./actions-util";
import * as environment from "./environment";
import * as logging from "./logging";
import { ActionName } from "./status-report";
import * as statusReport from "./status-report";
import {
  getTestActionsEnv,
  getTestEnv,
  makeMacro,
  RecordingLogger,
  setupTests,
} from "./testing-utils";
import { getErrorMessage } from "./util";

setupTests(test);

const expectedActionDisplayNames: Record<ActionName, string> = {
  [ActionName.Analyze]: "analyze action",
  [ActionName.AnalyzePost]: "analyze post-action",
  [ActionName.Autobuild]: "autobuild action",
  [ActionName.Init]: "init action",
  [ActionName.InitPost]: "init post-action",
  [ActionName.ResolveEnvironment]: "resolve-environment action",
  [ActionName.SetupCodeQL]: "setup-codeql action",
  [ActionName.StartProxy]: "start-proxy action",
  [ActionName.StartProxyPost]: "start-proxy post-action",
  [ActionName.UploadSarif]: "upload-sarif action",
  [ActionName.UploadSarifPost]: "upload-sarif post-action",
};

for (const [key, displayName] of Object.entries(expectedActionDisplayNames)) {
  test(`getDisplayActionName - '${displayName}' for '${key}'`, (t) => {
    t.is(statusReport.getDisplayActionName(key as ActionName), displayName);
  });
}

interface RunInActionsTestOpts {
  runFn?: () => Promise<any>;
  expectedErrorMessage?: string;
  expectedTelemetryError?: string;
}

const runInActionsMacro = makeMacro({
  exec: async (t, opts: RunInActionsTestOpts) => {
    const expectFailure = opts?.expectedErrorMessage !== undefined;

    const logger = new RecordingLogger();
    const getActionsLogger = sinon
      .stub(logging, "getActionsLogger")
      .returns(logger);

    const env = getTestEnv();
    const getEnv = sinon.stub(environment, "getEnv").returns(env);

    const actionsEnv = getTestActionsEnv(env);
    const getActionsEnv = sinon
      .stub(actionsUtil, "getActionsEnv")
      .returns(actionsEnv);

    const getJobUUID = sinon
      .stub(statusReport, "getJobUUID")
      .returns("test-job-uuid");

    const setFailed = sinon.stub(core, "setFailed");
    const sendUnhandledErrorStatusReport = sinon.stub(
      statusReport,
      "sendUnhandledErrorStatusReport",
    );

    const name = ActionName.Init;
    const run = sinon.stub();

    if (opts?.runFn) {
      run.callsFake(opts.runFn);
    }

    const transformTelemetryError = sinon
      .stub()
      .callsFake((err) => opts?.expectedTelemetryError ?? getErrorMessage(err));
    const testAction: common.Action = {
      name,
      run,
      transformTelemetryError,
    };

    await common.runInActions(testAction);

    // These always should have been called once.
    t.true(getActionsLogger.calledOnce);
    t.true(getEnv.calledOnce);
    t.true(getActionsEnv.calledOnce);

    const expectedActionState = {
      actions: actionsEnv,
      env,
      logger,
      name: ActionName.Init,
    };

    t.true(getJobUUID.calledOnceWithExactly(sinon.match(expectedActionState)));
    t.true(run.calledOnceWithExactly(sinon.match(expectedActionState)));

    t.is(setFailed.calledOnce, expectFailure ?? false);
    t.is(sendUnhandledErrorStatusReport.calledOnce, expectFailure ?? false);

    if (expectFailure) {
      t.true(
        setFailed.calledOnceWithExactly(
          `${statusReport.getDisplayActionName(name)} failed: ${opts?.expectedErrorMessage}`,
        ),
      );
      t.true(
        sendUnhandledErrorStatusReport.calledOnceWithExactly(
          name,
          sinon.match.any,
          opts?.expectedTelemetryError ?? opts?.expectedErrorMessage,
          logger,
        ),
      );
    }
  },
  title: (providedTitle) => `runInActions - ${providedTitle}`,
});

runInActionsMacro.serial("calls run", {});
runInActionsMacro.serial("handles run exceptions", {
  runFn: () => {
    throw new Error("Test failure");
  },
  expectedErrorMessage: "Test failure",
});
runInActionsMacro.serial("transforms run exceptions", {
  runFn: () => {
    throw new Error("Test failure");
  },
  expectedErrorMessage: "Test failure",
  expectedTelemetryError: "Transformed failure message",
});
