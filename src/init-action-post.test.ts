import test from "ava";

import { EnvVar } from "./environment";
import { GitHubVariant, type GitHubVersion } from "./github";
import { getFinalJobStatus } from "./init-action-post";
import { JobStatus } from "./status-report";
import { callee, createTestConfig, setupTests } from "./testing-utils";

setupTests(test);

const dotcom: GitHubVersion = { type: GitHubVariant.DOTCOM };

test("getFinalJobStatus reports a cancelled job status when the job was cancelled after init completed", async (t) => {
  await callee(getFinalJobStatus)
    .withArgs(createTestConfig({}), "cancelled", dotcom)
    .passes(t.is, JobStatus.CancelledStatus);
});

test("getFinalJobStatus reports a cancelled job status when the job was cancelled before init completed", async (t) => {
  await callee(getFinalJobStatus)
    .withArgs(undefined, "cancelled", dotcom)
    .passes(t.is, JobStatus.CancelledStatus);
});

test("getFinalJobStatus reports a cancelled job status on GitHub Enterprise Cloud with data residency", async (t) => {
  await callee(getFinalJobStatus)
    .withArgs(createTestConfig({}), "cancelled", {
      type: GitHubVariant.GHEC_DR,
    })
    .passes(t.is, JobStatus.CancelledStatus);
});

test("getFinalJobStatus reports success when the job was cancelled after analyze completed", async (t) => {
  await callee(getFinalJobStatus)
    .withEnv((env) => {
      env.set(EnvVar.ANALYZE_DID_COMPLETE_SUCCESSFULLY, "true");
    })
    .withArgs(createTestConfig({}), "cancelled", dotcom)
    .passes(t.is, JobStatus.SuccessStatus);
});

test("getFinalJobStatus reports the error from a CodeQL Action step when the job was cancelled afterwards", async (t) => {
  await callee(getFinalJobStatus)
    .withEnv((env) => {
      env.set(EnvVar.JOB_STATUS, JobStatus.FailureStatus);
    })
    .withArgs(createTestConfig({}), "cancelled", dotcom)
    .passes(t.is, JobStatus.FailureStatus);
});

test("getFinalJobStatus reports a configuration error when a step outside the CodeQL Action failed", async (t) => {
  await callee(getFinalJobStatus)
    .withArgs(createTestConfig({}), "failure", dotcom)
    .passes(t.is, JobStatus.ConfigErrorStatus);
});

test("getFinalJobStatus doesn't report a cancelled job status on GitHub Enterprise Server", async (t) => {
  const ghes: GitHubVersion = {
    type: GitHubVariant.GHES,
    version: "3.23.0",
  };
  await callee(getFinalJobStatus)
    .withArgs(createTestConfig({}), "cancelled", ghes)
    .passes(t.is, JobStatus.ConfigErrorStatus);
  await callee(getFinalJobStatus)
    .withArgs(undefined, "cancelled", ghes)
    .passes(t.is, JobStatus.UnknownStatus);
});
