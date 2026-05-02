import test from "ava";
import * as sinon from "sinon";

import * as actionsUtil from "./actions-util";
import * as properties from "./feature-flags/properties";
import { RepositoryPropertyName } from "./feature-flags/properties";
import { RepositoryNwo } from "./repository";
import { resolveToolsInput } from "./resolve-tools-input";
import { getRecordingLogger, LoggedMessage, setupTests } from "./testing-utils";
import { Success } from "./util";

setupTests(test);

const repositoryNwo = { owner: "owner", repo: "repo" } as RepositoryNwo;

test.serial(
  "resolveToolsInput returns undefined when no tools input or repository property is set",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns(undefined);

    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(undefined);

    const result = await resolveToolsInput(repositoryNwo, logger);

    t.is(result, undefined);
    t.is(loggedMessages.length, 0); // No logging when no tools input is resolved
  },
);

test.serial(
  "resolveToolsInput returns workflow input when only workflow input is provided",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns("latest");
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(undefined);
    const result = await resolveToolsInput(repositoryNwo, logger);

    t.is(result, "latest");
    t.is(loggedMessages.length, 1);
    t.is(
      loggedMessages[0].message,
      "Setting tools: latest based on workflow input.",
    );
  },
);

test.serial(
  "resolveToolsInput returns repository property when only repository property is provided",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns(undefined);

    const repositoryPropertiesResult = new Success({
      [RepositoryPropertyName.TOOLS]: "toolcache",
    });
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(repositoryPropertiesResult);
    const result = await resolveToolsInput(repositoryNwo, logger);

    t.is(result, "toolcache");
    t.is(loggedMessages.length, 2);
    t.is(
      loggedMessages[1].message,
      "Setting tools: toolcache based on the 'github-codeql-tools' repository property.",
    );
  },
);

test.serial(
  "resolveToolsInput prioritizes workflow input over repository property",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns("nightly");

    const repositoryPropertiesResult = new Success({
      [RepositoryPropertyName.TOOLS]: "toolcache",
    });
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(repositoryPropertiesResult);
    const result = await resolveToolsInput(repositoryNwo, logger);

    t.is(result, "nightly");
    t.is(loggedMessages.length, 2);
    t.is(
      loggedMessages[1].message,
      "Setting tools: nightly based on workflow input.",
    );
  },
);

test.serial(
  "resolveToolsInput handles empty string values correctly",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    sinon.stub(actionsUtil, "getOptionalInput").withArgs("tools").returns("");

    const repositoryPropertiesResult = new Success({
      [RepositoryPropertyName.TOOLS]: "toolcache",
    });
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(repositoryPropertiesResult);

    const result = await resolveToolsInput(repositoryNwo, logger);

    // Empty string is falsy, so should fall back to repository property
    t.is(result, "toolcache");
    t.is(loggedMessages.length, 2);
    t.is(
      loggedMessages[1].message,
      "Setting tools: toolcache based on the 'github-codeql-tools' repository property.",
    );
  },
);

test.serial(
  "resolveToolsInput handles various tools input values correctly",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    // Test with specific version
    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns("2.15.0");

    const repositoryPropertiesResult = new Success({
      [RepositoryPropertyName.TOOLS]: "2.20.0",
    });
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(repositoryPropertiesResult);
    const result = await resolveToolsInput(repositoryNwo, logger);
    t.is(result, "2.15.0");
    t.is(
      loggedMessages[loggedMessages.length - 1].message,
      "Setting tools: 2.15.0 based on workflow input.",
    );
  },
);

test.serial(
  "resolveToolsInput handles URL input values correctly",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    // Test with URL
    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns("https://example.com/codeql-bundle.tar.gz");
    const repositoryPropertiesResult = new Success({
      [RepositoryPropertyName.TOOLS]:
        "https://example.com/old-codeql-bundle.tar.gz",
    });
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(repositoryPropertiesResult);
    const result = await resolveToolsInput(repositoryNwo, logger);
    t.is(result, "https://example.com/codeql-bundle.tar.gz");
    t.is(
      loggedMessages[loggedMessages.length - 1].message,
      "Setting tools: https://example.com/codeql-bundle.tar.gz based on workflow input.",
    );
  },
);

test.serial(
  "resolveToolsInput handles repository property with different values",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns(undefined);

    // Test with "latest"
    const repositoryProperties = {
      [RepositoryPropertyName.TOOLS]: "latest",
    };
    const repositoryPropertiesResult = new Success(repositoryProperties);
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(repositoryPropertiesResult);

    const result = await resolveToolsInput(repositoryNwo, logger);
    t.is(result, "latest");
    t.is(
      loggedMessages[loggedMessages.length - 1].message,
      "Setting tools: latest based on the 'github-codeql-tools' repository property.",
    );
  },
);

test.serial(
  "resolveToolsInput handles repository property with specific version",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns(undefined);

    const repositoryProperties = {
      [RepositoryPropertyName.TOOLS]: "2.16.1",
    };
    const repositoryPropertiesResult = new Success(repositoryProperties);
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(repositoryPropertiesResult);

    const result = await resolveToolsInput(repositoryNwo, logger);
    t.is(result, "2.16.1");
    t.is(
      loggedMessages[loggedMessages.length - 1].message,
      "Setting tools: 2.16.1 based on the 'github-codeql-tools' repository property.",
    );
  },
);

test.serial(
  "resolveToolsInput handles undefined repository property correctly",
  async (t) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);

    sinon
      .stub(actionsUtil, "getOptionalInput")
      .withArgs("tools")
      .returns(undefined);

    const repositoryProperties = {
      [RepositoryPropertyName.TOOLS]: undefined,
    };

    const repositoryPropertiesResult = new Success(repositoryProperties);
    sinon
      .stub(properties, "loadRepositoryProperties")
      .withArgs(repositoryNwo, logger)
      .resolves(repositoryPropertiesResult);

    const result = await resolveToolsInput(repositoryNwo, logger);

    t.is(result, undefined);
    t.is(loggedMessages.length, 1);
    t.is(
      loggedMessages[0].message,
      "Loaded repository properties: github-codeql-tools",
    );
  },
);
