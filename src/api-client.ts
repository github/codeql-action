import * as core from "@actions/core";
import * as github from "@actions/github";
import consoleLogLevel from "console-log-level";

import { isLocalRun } from "./util";

export const getApiClient = function(allowLocalRun = false) {
  if (isLocalRun() && !allowLocalRun) {
    throw new Error('Invalid API call in local run');
  }
  return new github.GitHub(
    core.getInput('token'),
    {
      userAgent: "CodeQL Action",
      log: consoleLogLevel({ level: "debug" })
    });
};
