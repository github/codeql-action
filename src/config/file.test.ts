import test from "ava";
import sinon from "sinon";

import { RepositoryPropertyName } from "../feature-flags/properties";
import { getTestActionsEnv, setupTests } from "../testing-utils";

import { getConfigFileInput } from "./file";

setupTests(test);

test("getConfigFileInput returns undefined by default", async (t) => {
  const actionsEnv = getTestActionsEnv();
  const result = getConfigFileInput(actionsEnv, {});
  t.is(result, undefined);
});

const repositoryProperties = {
  [RepositoryPropertyName.CONFIG_FILE]: "/path/from/property",
};

test("getConfigFileInput returns input value", async (t) => {
  const actionsEnv = getTestActionsEnv();
  const testInput = "/some/path";
  sinon
    .stub(actionsEnv, "getOptionalInput")
    .withArgs("config-file")
    .returns(testInput);

  // Even though both an input and repository property are configured,
  // we prefer the direct input to the Action.
  const result = getConfigFileInput(actionsEnv, repositoryProperties);
  t.is(result, testInput);
});

test("getConfigFileInput returns repository property value", async (t) => {
  const actionsEnv = getTestActionsEnv();

  // Since there is no direct input, we should use the repository property.
  const result = getConfigFileInput(actionsEnv, repositoryProperties);
  t.is(result, repositoryProperties[RepositoryPropertyName.CONFIG_FILE]);
});
