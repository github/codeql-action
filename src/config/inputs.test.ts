import test from "ava";
import sinon from "sinon";

import { getActionsEnv } from "../actions-util";
import { Feature } from "../feature-flags";
import { RepositoryPropertyName } from "../feature-flags/properties";
import { callee } from "../testing-utils";

import { ComputedInput, getToolsInput, InputName, InputSource } from "./inputs";

test("getToolsInput - undefined if there's no input", async (t) => {
  await callee(getToolsInput).withArgs({}).passes(t.is, undefined);
});

const expectedWorkflowResult: ComputedInput = {
  name: InputName.Tools,
  source: InputSource.Workflow,
  value: "workflow-input-value",
};

const expectedRepositoryPropertyResult: ComputedInput = {
  name: InputName.Tools,
  source: InputSource.RepositoryProperty,
  value: "repo-property-input-value",
};

function stubGetToolsInput() {
  const actions = getActionsEnv();
  sinon
    .stub(actions, "getOptionalInput")
    .withArgs(InputName.Tools)
    .returns(expectedWorkflowResult.value);
  return actions;
}

const workflowLogMessage = `Using ${InputName.Tools} input from workflow:`;

test("getToolsInput - returns workflow input if available", async (t) => {
  const actions = stubGetToolsInput();

  await callee(getToolsInput)
    .withActions(actions)
    .withArgs({})
    .logs(t, workflowLogMessage)
    .passes(t.deepEqual, expectedWorkflowResult);
});

test("getToolsInput - returns repository property value if enforced", async (t) => {
  const actions = stubGetToolsInput();

  const target = callee(getToolsInput)
    .withActions(actions)
    .withArgs({
      [RepositoryPropertyName.TOOLS]: `!${expectedRepositoryPropertyResult.value}`,
    });

  // We expect the repository value if provided and the FF is enabled.
  const enforcedLogMessage = `Using ${InputName.Tools} input from repository property (enforced):`;
  await target
    .withFeatures([Feature.ToolsRepositoryProperty])
    .logs(t, enforcedLogMessage)
    .passes(t.deepEqual, expectedRepositoryPropertyResult);
  await target
    .notLogs(t, enforcedLogMessage)
    .logs(t, workflowLogMessage)
    .passes(t.deepEqual, expectedWorkflowResult);
});

test("getToolsInput - prefers workflow input", async (t) => {
  const actions = stubGetToolsInput();

  const target = callee(getToolsInput)
    .withActions(actions)
    .withArgs({
      [RepositoryPropertyName.TOOLS]: expectedRepositoryPropertyResult.value,
    });

  // We expect the workflow input regardless of the FF state.
  await target
    .withFeatures([Feature.ToolsRepositoryProperty])
    .logs(t, workflowLogMessage)
    .passes(t.deepEqual, expectedWorkflowResult);
  await target
    .logs(t, workflowLogMessage)
    .passes(t.deepEqual, expectedWorkflowResult);
});

test("getToolsInput - returns repository property", async (t) => {
  const target = callee(getToolsInput).withArgs({
    [RepositoryPropertyName.TOOLS]: expectedRepositoryPropertyResult.value,
  });

  // We expect the repository property if the FF is enabled or undefined otherwise.
  await target
    .withFeatures([Feature.ToolsRepositoryProperty])
    .logs(t, `Using ${InputName.Tools} input from repository property:`)
    .passes(t.deepEqual, expectedRepositoryPropertyResult);
  await target.passes(t.is, undefined);
});
