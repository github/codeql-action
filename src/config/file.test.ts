import test from "ava";
import sinon from "sinon";

import { RepositoryPropertyName } from "../feature-flags/properties";
import {
  getTestActionsEnv,
  RecordingLogger,
  setupTests,
} from "../testing-utils";

import { getConfigFileInput } from "./file";

setupTests(test);

test("getConfigFileInput returns undefined by default", async (t) => {
  const logger = new RecordingLogger();
  const actionsEnv = getTestActionsEnv();
  const result = getConfigFileInput(logger, actionsEnv, {}, true);
  t.is(result, undefined);
});

const repositoryProperties = {
  [RepositoryPropertyName.CONFIG_FILE]: "/path/from/property",
};

test("getConfigFileInput returns input value", async (t) => {
  const logger = new RecordingLogger();
  const actionsEnv = getTestActionsEnv();
  const testInput = "/some/path";
  sinon
    .stub(actionsEnv, "getOptionalInput")
    .withArgs("config-file")
    .returns(testInput);

  // Even though both an input and repository property are configured,
  // we prefer the direct input to the Action.
  const result = getConfigFileInput(
    logger,
    actionsEnv,
    repositoryProperties,
    true,
  );
  t.is(result, testInput);

  // Check for the expected log message.
  t.true(logger.hasMessage("Using configuration file input from workflow"));
});

test("getConfigFileInput returns repository property value", async (t) => {
  const logger = new RecordingLogger();
  const actionsEnv = getTestActionsEnv();

  // Since there is no direct input, we should use the repository property.
  const result = getConfigFileInput(
    logger,
    actionsEnv,
    repositoryProperties,
    true,
  );
  t.is(result, repositoryProperties[RepositoryPropertyName.CONFIG_FILE]);

  // Check for the expected log message.
  t.true(
    logger.hasMessage(
      "Using configuration file input from repository property",
    ),
  );
});

test("getConfigFileInput ignores empty repository property value", async (t) => {
  const logger = new RecordingLogger();
  const actionsEnv = getTestActionsEnv();

  // Since the repository property value is an empty/whitespace string, we should ignore it.
  const result = getConfigFileInput(
    logger,
    actionsEnv,
    {
      [RepositoryPropertyName.CONFIG_FILE]: "   ",
    },
    true,
  );
  t.is(result, undefined);
});

test("getConfigFileInput ignores repository property value when FF is off", async (t) => {
  const logger = new RecordingLogger();
  const actionsEnv = getTestActionsEnv();

  // Since the FF is off, we should ignore the repository property value.
  const result = getConfigFileInput(
    logger,
    actionsEnv,
    repositoryProperties,
    false,
  );
  t.is(result, undefined);

  t.false(
    logger.hasMessage(
      "Using configuration file input from repository property",
    ),
  );
});
