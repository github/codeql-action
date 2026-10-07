import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";
import * as github from "@actions/github";
import test from "ava";
import * as sinon from "sinon";

import * as analyses from "./analyses";
import * as apiClient from "./api-client";
import * as configFile from "./config/file";
import * as configInputs from "./config/inputs";
import { EnvVar } from "./environment";
import * as featureFlags from "./feature-flags";
import * as init from "./init";
import { runWrapper } from "./init-action";
import * as statusReport from "./status-report";
import { createFeatures, setupActionsVars, setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test.serial(
  "init skips before downloading tools or initializing a database for a draft",
  async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir, { GITHUB_EVENT_NAME: "pull_request" });
      process.env["INPUT_TOKEN"] = "test-token";
      process.env["INPUT_SKIP-IF-DRAFT"] = "true";
      const githubEnvPath = path.join(tmpDir, "github-env");
      const githubOutputPath = path.join(tmpDir, "github-output");
      const githubStatePath = path.join(tmpDir, "github-state");
      process.env["GITHUB_ENV"] = githubEnvPath;
      process.env["GITHUB_OUTPUT"] = githubOutputPath;
      process.env["GITHUB_STATE"] = githubStatePath;
      for (const file of [githubEnvPath, githubOutputPath, githubStatePath]) {
        fs.writeFileSync(file, "");
      }

      const originalPayload = github.context.payload;
      github.context.payload = {
        pull_request: { number: 1, draft: true },
        repository: {
          name: "codeql-action-test",
          owner: { login: "test", type: "User" },
        },
      };

      try {
        sinon.stub(apiClient, "getGitHubVersion").resolves({
          type: util.GitHubVariant.DOTCOM,
        });
        sinon.stub(featureFlags, "initFeatures").returns(createFeatures([]));
        sinon
          .stub(analyses, "getAnalysisKinds")
          .resolves([analyses.AnalysisKind.CodeScanning]);
        sinon.stub(configFile, "getConfigFileInput").resolves(undefined);
        sinon.stub(statusReport, "createStatusReportBase").resolves(undefined);
        sinon.stub(util, "checkDiskUsage").resolves(undefined);
        sinon.stub(util, "checkForTimeout").resolves();

        const getToolsInputStub = sinon.stub(configInputs, "getToolsInput");
        const initCodeQLStub = sinon.stub(init, "initCodeQL");
        const databaseInitStub = sinon.stub(init, "runDatabaseInitCluster");
        const outputs = new Map<string, string>();
        sinon
          .stub(core, "setOutput")
          .callsFake((name: string, value: string) => {
            outputs.set(name, value);
          });

        await runWrapper();

        t.false(getToolsInputStub.called);
        t.false(initCodeQLStub.called);
        t.false(databaseInitStub.called);
        t.is(outputs.get("analysis-skipped"), "true");
        t.is(
          process.env[EnvVar.ANALYSIS_SKIP_REASON],
          "the pull request is a draft",
        );
      } finally {
        github.context.payload = originalPayload;
      }
    });
  },
);
