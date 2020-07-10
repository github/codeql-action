import * as core from "@actions/core";
import * as github from "@actions/github";
import consoleLogLevel from "console-log-level";

export const getApiClient = function() {
  return new github.GitHub(
    core.getInput('token'),
    {
      userAgent: "CodeQL Action",
      log: consoleLogLevel({ level: "debug" })
    });
};
