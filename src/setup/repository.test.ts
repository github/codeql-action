import * as path from "path";

import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "../actions-util";
import { getRunnerLogger } from "../logging";
import { setupTests } from "../testing-utils";
import { initializeEnvironment } from "../util";

import { getCodeQLActionRepository } from "./repository";

setupTests(test);

test.serial("getCodeQLActionRepository", (t) => {
  const logger = getRunnerLogger(true);

  initializeEnvironment("1.2.3");

  // isRunningLocalAction() === true
  delete process.env["GITHUB_ACTION_REPOSITORY"];
  process.env["RUNNER_TEMP"] = path.dirname(__dirname);
  const repoLocalRunner = getCodeQLActionRepository(logger);
  t.deepEqual(repoLocalRunner, "github/codeql-action");

  // isRunningLocalAction() === false
  sinon.stub(actionsUtil, "isRunningLocalAction").returns(false);
  process.env["GITHUB_ACTION_REPOSITORY"] = "xxx/yyy";
  const repoEnv = getCodeQLActionRepository(logger);
  t.deepEqual(repoEnv, "xxx/yyy");
});
