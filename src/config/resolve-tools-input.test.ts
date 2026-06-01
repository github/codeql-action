import test from "ava";

import {
  EffectiveToolsInputSource,
  resolveToolsInput,
  resolveToolsInputWithMetadata,
} from "../config/resolve-tools-input";
import {
  RepositoryPropertyName,
  ToolsModeRepositoryPropertyValue,
} from "../feature-flags/properties";
import type { RepositoryProperties } from "../feature-flags/properties";
import {
  getRecordingLogger,
  LoggedMessage,
  setupTests,
} from "../testing-utils";

setupTests(test);

test("resolveToolsInput returns undefined when no tools input or repository property is set", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const result = resolveToolsInput(undefined, false, {}, logger);

  t.is(result, undefined);
  t.is(loggedMessages.length, 0);
});

test("resolveToolsInput returns workflow input when only workflow input is provided", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const result = resolveToolsInput("latest", false, {}, logger);

  t.is(result, "latest");
  t.is(loggedMessages.length, 1);
  t.is(
    loggedMessages[0].message,
    "Setting tools: latest based on workflow input.",
  );
});

test("resolveToolsInput returns repository property when only repository property is provided", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const repositoryProperties: RepositoryProperties = {
    [RepositoryPropertyName.TOOLS]: "toolcache",
  };
  const result = resolveToolsInput(
    undefined,
    false,
    repositoryProperties,
    logger,
  );

  t.is(result, "toolcache");
  t.is(loggedMessages.length, 1);
  t.is(
    loggedMessages[0].message,
    "Setting tools: toolcache based on the 'github-codeql-tools' repository property (mode: 'enforce').",
  );
});

test("resolveToolsInput prioritizes workflow input over repository property", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const repositoryProperties: RepositoryProperties = {
    [RepositoryPropertyName.TOOLS]: "toolcache",
  };
  const result = resolveToolsInput(
    "nightly",
    false,
    repositoryProperties,
    logger,
  );

  t.is(result, "nightly");
  t.is(loggedMessages.length, 1);
  t.is(
    loggedMessages[0].message,
    "Setting tools: nightly based on workflow input.",
  );
});

test("resolveToolsInput treats empty string workflow input as not set", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const repositoryProperties: RepositoryProperties = {
    [RepositoryPropertyName.TOOLS]: "toolcache",
  };
  const result = resolveToolsInput("", false, repositoryProperties, logger);

  t.is(result, "toolcache");
  t.is(loggedMessages.length, 1);
  t.is(
    loggedMessages[0].message,
    "Setting tools: toolcache based on the 'github-codeql-tools' repository property (mode: 'enforce').",
  );
});

test("resolveToolsInput returns undefined when repository property is undefined", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const repositoryProperties: RepositoryProperties = {
    [RepositoryPropertyName.TOOLS]: undefined,
  };
  const result = resolveToolsInput(
    undefined,
    false,
    repositoryProperties,
    logger,
  );

  t.is(result, undefined);
  t.is(loggedMessages.length, 0);
});

test("resolveToolsInput returns repository property when workflow input is not set", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const repositoryProperties: RepositoryProperties = {
    [RepositoryPropertyName.TOOLS]: "toolcache",
  };
  const result = resolveToolsInput(
    undefined,
    false,
    repositoryProperties,
    logger,
  );

  t.is(result, "toolcache");
  t.is(loggedMessages.length, 1);
  t.is(
    loggedMessages[0].message,
    "Setting tools: toolcache based on the 'github-codeql-tools' repository property (mode: 'enforce').",
  );
});

test("resolveToolsInput does not log when workflow input and repository property are not set", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const result = resolveToolsInput(undefined, false, {}, logger);

  t.is(result, undefined);
  t.is(loggedMessages.length, 0);
});

test("resolveToolsInput applies tools property in enforce mode for static workflows", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const repositoryProperties: RepositoryProperties = {
    [RepositoryPropertyName.TOOLS]: "toolcache",
    [RepositoryPropertyName.TOOLS_MODE]:
      ToolsModeRepositoryPropertyValue.Enforce,
  };
  const result = resolveToolsInput(
    undefined,
    false,
    repositoryProperties,
    logger,
  );

  t.is(result, "toolcache");
  t.is(loggedMessages.length, 1);
  t.is(
    loggedMessages[0].message,
    "Setting tools: toolcache based on the 'github-codeql-tools' repository property (mode: 'enforce').",
  );
});

test("resolveToolsInput applies tools property in dynamic mode for dynamic workflows", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const repositoryProperties: RepositoryProperties = {
    [RepositoryPropertyName.TOOLS]: "toolcache",
    [RepositoryPropertyName.TOOLS_MODE]:
      ToolsModeRepositoryPropertyValue.Dynamic,
  };
  const result = resolveToolsInput(undefined, true, repositoryProperties, logger);

  t.is(result, "toolcache");
  t.is(loggedMessages.length, 1);
  t.is(
    loggedMessages[0].message,
    "Setting tools: toolcache based on the 'github-codeql-tools' repository property (mode: 'dynamic').",
  );
});

test("resolveToolsInput ignores tools property in dynamic mode for static workflows", (t) => {
  const loggedMessages: LoggedMessage[] = [];
  const logger = getRecordingLogger(loggedMessages);

  const repositoryProperties: RepositoryProperties = {
    [RepositoryPropertyName.TOOLS]: "toolcache",
    [RepositoryPropertyName.TOOLS_MODE]:
      ToolsModeRepositoryPropertyValue.Dynamic,
  };
  const result = resolveToolsInput(
    undefined,
    false,
    repositoryProperties,
    logger,
  );

  t.is(result, undefined);
  t.is(loggedMessages.length, 1);
  t.is(
    loggedMessages[0].message,
    "Ignoring 'github-codeql-tools' repository property because 'github-codeql-tools-mode' is set to 'dynamic' and this is not a dynamic workflow.",
  );
});

test("resolveToolsInputWithMetadata reports workflow input source", (t) => {
  const logger = getRecordingLogger([]);

  const result = resolveToolsInputWithMetadata("latest", false, {}, logger);

  t.is(result.effectiveToolsInput, "latest");
  t.is(result.effectiveToolsInputSource, EffectiveToolsInputSource.WorkflowInput);
  t.is(result.toolsRepoPropertyMode, undefined);
});

test("resolveToolsInputWithMetadata reports repository property source and mode", (t) => {
  const logger = getRecordingLogger([]);

  const result = resolveToolsInputWithMetadata(
    undefined,
    false,
    {
      [RepositoryPropertyName.TOOLS]: "toolcache",
      [RepositoryPropertyName.TOOLS_MODE]:
        ToolsModeRepositoryPropertyValue.Enforce,
    },
    logger,
  );

  t.is(result.effectiveToolsInput, "toolcache");
  t.is(
    result.effectiveToolsInputSource,
    EffectiveToolsInputSource.RepositoryProperty,
  );
  t.is(result.toolsRepoPropertyMode, ToolsModeRepositoryPropertyValue.Enforce);
});

test("resolveToolsInputWithMetadata reports dynamic-mode skip on static workflows", (t) => {
  const logger = getRecordingLogger([]);

  const result = resolveToolsInputWithMetadata(
    undefined,
    false,
    {
      [RepositoryPropertyName.TOOLS]: "toolcache",
      [RepositoryPropertyName.TOOLS_MODE]:
        ToolsModeRepositoryPropertyValue.Dynamic,
    },
    logger,
  );

  t.is(result.effectiveToolsInput, undefined);
  t.is(result.effectiveToolsInputSource, EffectiveToolsInputSource.None);
  t.is(result.toolsRepoPropertyMode, ToolsModeRepositoryPropertyValue.Dynamic);
});
