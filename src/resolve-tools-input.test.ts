import test from "ava";

import { RepositoryPropertyName } from "./feature-flags/properties";
import type { RepositoryProperties } from "./feature-flags/properties";
import { resolveToolsInput } from "./resolve-tools-input";
import { getRecordingLogger, LoggedMessage, setupTests } from "./testing-utils";

setupTests(test);

test(
  "resolveToolsInput returns undefined when no tools input or repository property is set",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const result = resolveToolsInput(undefined, {}, logger);

    t.is(result, undefined);
    t.is(loggedMessages.length, 0);
  },
);

test(
  "resolveToolsInput returns workflow input when only workflow input is provided",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const result = resolveToolsInput("latest", {}, logger);

    t.is(result, "latest");
    t.is(loggedMessages.length, 1);
    t.is(
      loggedMessages[0].message,
      "Setting tools: latest based on workflow input.",
    );
  },
);

test(
  "resolveToolsInput returns repository property when only repository property is provided",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const repositoryProperties: RepositoryProperties = {
      [RepositoryPropertyName.TOOLS]: "toolcache",
    };
    const result = resolveToolsInput(undefined, repositoryProperties, logger);

    t.is(result, "toolcache");
    t.is(loggedMessages.length, 1);
    t.is(
      loggedMessages[0].message,
      "Setting tools: toolcache based on the 'github-codeql-tools' repository property.",
    );
  },
);

test(
  "resolveToolsInput prioritizes workflow input over repository property",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const repositoryProperties: RepositoryProperties = {
      [RepositoryPropertyName.TOOLS]: "toolcache",
    };
    const result = resolveToolsInput("nightly", repositoryProperties, logger);

    t.is(result, "nightly");
    t.is(loggedMessages.length, 1);
    t.is(
      loggedMessages[0].message,
      "Setting tools: nightly based on workflow input.",
    );
  },
);

test(
  "resolveToolsInput treats empty string workflow input as not set",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const repositoryProperties: RepositoryProperties = {
      [RepositoryPropertyName.TOOLS]: "toolcache",
    };
    const result = resolveToolsInput("", repositoryProperties, logger);

    t.is(result, "toolcache");
    t.is(loggedMessages.length, 1);
    t.is(
      loggedMessages[0].message,
      "Setting tools: toolcache based on the 'github-codeql-tools' repository property.",
    );
  },
);

test(
  "resolveToolsInput returns workflow input with URL value",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const url = "https://example.com/codeql-bundle.tar.gz";
    const result = resolveToolsInput(url, {}, logger);

    t.is(result, url);
    t.is(loggedMessages.length, 1);
    t.is(
      loggedMessages[0].message,
      `Setting tools: ${url} based on workflow input.`,
    );
  },
);

test(
  "resolveToolsInput returns repository property with 'latest' value",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const repositoryProperties: RepositoryProperties = {
      [RepositoryPropertyName.TOOLS]: "latest",
    };
    const result = resolveToolsInput(undefined, repositoryProperties, logger);

    t.is(result, "latest");
    t.is(
      loggedMessages[0].message,
      "Setting tools: latest based on the 'github-codeql-tools' repository property.",
    );
  },
);

test(
  "resolveToolsInput returns repository property with specific version",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const repositoryProperties: RepositoryProperties = {
      [RepositoryPropertyName.TOOLS]: "2.16.1",
    };
    const result = resolveToolsInput(undefined, repositoryProperties, logger);

    t.is(result, "2.16.1");
    t.is(
      loggedMessages[0].message,
      "Setting tools: 2.16.1 based on the 'github-codeql-tools' repository property.",
    );
  },
);

test(
  "resolveToolsInput returns undefined when repository property is undefined",
  (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    const repositoryProperties: RepositoryProperties = {
      [RepositoryPropertyName.TOOLS]: undefined,
    };
    const result = resolveToolsInput(undefined, repositoryProperties, logger);

    t.is(result, undefined);
    t.is(loggedMessages.length, 0);
  },
);

