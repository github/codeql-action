import test from "ava";
import sinon from "sinon";

import { Feature } from "../feature-flags";
import { RepositoryPropertyName } from "../feature-flags/properties";
import { callee, setupTests } from "../testing-utils";

import { getConfigFileInput } from "./file";

setupTests(test);

test("getConfigFileInput returns undefined by default", async (t) => {
  await callee(getConfigFileInput)
    .withArgs({})
    .withFeatures([Feature.ConfigFileRepositoryProperty])
    .passes(t.is, undefined);
});

const repositoryProperties = {
  [RepositoryPropertyName.CONFIG_FILE]: "/path/from/property",
};

test("getConfigFileInput returns input value", async (t) => {
  const testInput = "/some/path";
  const target = callee(getConfigFileInput).withFeatures([
    Feature.ConfigFileRepositoryProperty,
  ]);

  const actionsEnv = target.getState().actions;
  sinon
    .stub(actionsEnv, "getOptionalInput")
    .withArgs("config-file")
    .returns(testInput);

  // Even though both an input and repository property are configured,
  // we prefer the direct input to the Action.
  await target
    .withActions(actionsEnv)
    .withArgs(repositoryProperties)
    .logs(t, "Using configuration file input from workflow")
    .passes(t.is, testInput);
});

test("getConfigFileInput returns repository property value", async (t) => {
  // Since there is no direct input, we should use the repository property.
  await callee(getConfigFileInput)
    .withFeatures([Feature.ConfigFileRepositoryProperty])
    .withArgs(repositoryProperties)
    .logs(t, "Using configuration file input from repository property")
    .passes(t.is, repositoryProperties[RepositoryPropertyName.CONFIG_FILE]);
});

test("getConfigFileInput ignores empty repository property value", async (t) => {
  // Since the repository property value is an empty/whitespace string, we should ignore it.
  await callee(getConfigFileInput)
    .withFeatures([Feature.ConfigFileRepositoryProperty])
    .withArgs({ [RepositoryPropertyName.CONFIG_FILE]: "   " })
    .passes(t.is, undefined);
});

test("getConfigFileInput ignores repository property value when FF is off", async (t) => {
  // Since the FF is off, we should ignore the repository property value.
  await callee(getConfigFileInput)
    .withFeatures([])
    .withArgs(repositoryProperties)
    .notLogs(t, "Using configuration file input from repository property")
    .logs(
      t,
      "Ignoring configuration file input from repository property, because the corresponding feature flag is disabled.",
    )
    .passes(t.is, undefined);
});
