import test from "ava";
import sinon from "sinon";

import { getTestActionsEnv, setupTests } from "../testing-utils";

import { getConfigFileInput } from "./file";

setupTests(test);

test("getConfigFileInput returns undefined by default", async (t) => {
  const actionsEnv = getTestActionsEnv();
  const result = getConfigFileInput(actionsEnv);
  t.is(result, undefined);
});

test("getConfigFileInput returns input value", async (t) => {
  const actionsEnv = getTestActionsEnv();
  const testInput = "/some/path";
  sinon
    .stub(actionsEnv, "getOptionalInput")
    .withArgs("config-file")
    .returns(testInput);

  const result = getConfigFileInput(actionsEnv);
  t.is(result, testInput);
});
