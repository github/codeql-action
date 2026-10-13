import * as core from "@actions/core";
import test, { ExecutionContext } from "ava";
import sinon from "sinon";

import * as statusReport from "../status-report";
import {
  makeMacro,
  setupTests,
  withRecordingLoggerAsync,
} from "../testing-utils";
import { ConfigurationError } from "../util";

import * as startProxyExports from "./status-report";

setupTests(test);

const sendFailedStatusReportTest = makeMacro({
  exec: async (
    t: ExecutionContext<unknown>,
    err: Error,
    expectedMessage: string,
    expectedStatus: statusReport.ActionStatus = "failure",
  ) => {
    const now = new Date();

    // Override core.setFailed to avoid it setting the program's exit code
    sinon.stub(core, "setFailed").returns();

    const createStatusReportBase = sinon.stub(
      statusReport,
      "createStatusReportBase",
    );
    createStatusReportBase.resolves(undefined);

    await withRecordingLoggerAsync(async (logger) => {
      await startProxyExports.sendFailedStatusReport(
        logger,
        now,
        undefined,
        err,
      );

      // Check that the stub has been called exactly once, with the expected arguments,
      // but not with the message from the error.
      sinon.assert.calledOnceWithExactly(
        createStatusReportBase,
        statusReport.ActionName.StartProxy,
        expectedStatus,
        now,
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        expectedMessage,
      );
      t.false(
        createStatusReportBase.calledWith(
          statusReport.ActionName.StartProxy,
          expectedStatus,
          now,
          sinon.match.any,
          sinon.match.any,
          sinon.match.any,
          sinon.match((msg: string) => msg.includes(err.message)),
        ),
        "createStatusReportBase was called with the error message",
      );
    });
  },

  title: (providedTitle = "") => `sendFailedStatusReport - ${providedTitle}`,
});

sendFailedStatusReportTest.serial(
  "reports generic error message for non-StartProxyError error",
  new Error("Something went wrong today"),
  "Error from start-proxy Action omitted (Error).",
);

sendFailedStatusReportTest.serial(
  "reports generic error message for non-StartProxyError error with safe error message",
  new Error(
    startProxyExports.getStartProxyErrorMessage(
      startProxyExports.StartProxyErrorType.DownloadFailed,
    ),
  ),
  "Error from start-proxy Action omitted (Error).",
);

sendFailedStatusReportTest.serial(
  "reports generic error message for ConfigurationError error",
  new ConfigurationError("Something went wrong today"),
  "Error from start-proxy Action omitted (ConfigurationError).",
  "user-error",
);
