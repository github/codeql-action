import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "../actions-util";
import { ActionsEnvVars } from "../environment";
import { callee, setupTests } from "../testing-utils";
import { initializeEnvironment } from "../util";

import { getCodeQLActionRepository } from "./repository";

setupTests(test);

test.serial("getCodeQLActionRepository", async (t) => {
  initializeEnvironment("1.2.3");

  const target = callee(getCodeQLActionRepository)
    .withArgs()
    .withEnv((env) => {
      env.set(ActionsEnvVars.RUNNER_TEMP, path.dirname(__dirname));
    });

  // isRunningLocalAction() === true
  await target.passes(t.deepEqual, "github/codeql-action");

  // isRunningLocalAction() === false
  sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
  await target
    .withEnv((env) => {
      env.set(ActionsEnvVars.GITHUB_ACTION_REPOSITORY, "xxx/yyy");
    })
    .passes(t.deepEqual, "xxx/yyy");
});
