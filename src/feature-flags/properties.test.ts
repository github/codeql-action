import test from "ava";
import * as sinon from "sinon";

import * as api from "../api-client";
import { getRunnerLogger } from "../logging";
import { parseRepositoryNwo } from "../repository";
import { RecordingLogger, setupTests } from "../testing-utils";

import * as properties from "./properties";

setupTests(test);

test.serial(
  "loadPropertiesFromApi throws if response data is not an array",
  async (t) => {
    sinon.stub(api, "getRepositoryProperties").resolves({
      headers: {},
      status: 200,
      url: "",
      data: {},
    });
    const logger = getRunnerLogger(true);
    const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
    await t.throwsAsync(
      properties.loadPropertiesFromApi(logger, mockRepositoryNwo),
      {
        message: /Expected repository properties API to return an array/,
      },
    );
  },
);

test.serial(
  "loadPropertiesFromApi throws if response data contains objects without `property_name`",
  async (t) => {
    sinon.stub(api, "getRepositoryProperties").resolves({
      headers: {},
      status: 200,
      url: "",
      data: [{}],
    });
    const logger = getRunnerLogger(true);
    const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
    await t.throwsAsync(
      properties.loadPropertiesFromApi(logger, mockRepositoryNwo),
      {
        message:
          /Expected repository property object to have a 'property_name'/,
      },
    );
  },
);

test.serial(
  "loadPropertiesFromApi does not throw for unexpected value types of unknown properties",
  async (t) => {
    sinon.stub(api, "getRepositoryProperties").resolves({
      headers: {},
      status: 200,
      url: "",
      data: [
        { property_name: "not-used-by-us", value: { foo: "bar" } },
        { property_name: "also-not-used-by-us", value: ["A", "B", "C"] },
      ],
    });
    const logger = getRunnerLogger(true);
    const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
    await t.notThrowsAsync(
      properties.loadPropertiesFromApi(logger, mockRepositoryNwo),
    );
  },
);

test.serial("loadPropertiesFromApi loads known properties", async (t) => {
  sinon.stub(api, "getRepositoryProperties").resolves({
    headers: {},
    status: 200,
    url: "",
    data: [
      { property_name: "github-codeql-extra-queries", value: "+queries" },
      { property_name: "unknown-property", value: "something" },
    ] satisfies properties.GitHubPropertiesResponse,
  });
  const logger = getRunnerLogger(true);
  const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
  const response = await properties.loadPropertiesFromApi(
    logger,
    mockRepositoryNwo,
  );
  t.deepEqual(response, { "github-codeql-extra-queries": "+queries" });
});

test.serial("loadPropertiesFromApi parses true boolean property", async (t) => {
  sinon.stub(api, "getRepositoryProperties").resolves({
    headers: {},
    status: 200,
    url: "",
    data: [
      {
        property_name: "github-codeql-disable-overlay",
        value: "true",
      },
      { property_name: "github-codeql-extra-queries", value: "+queries" },
    ] satisfies properties.GitHubPropertiesResponse,
  });
  const logger = getRunnerLogger(true);
  const warningSpy = sinon.spy(logger, "warning");
  const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
  const response = await properties.loadPropertiesFromApi(
    logger,
    mockRepositoryNwo,
  );
  t.deepEqual(response, {
    "github-codeql-disable-overlay": true,
    "github-codeql-extra-queries": "+queries",
  });
  t.true(warningSpy.notCalled);
});

test.serial(
  "loadPropertiesFromApi parses false boolean property",
  async (t) => {
    sinon.stub(api, "getRepositoryProperties").resolves({
      headers: {},
      status: 200,
      url: "",
      data: [
        {
          property_name: "github-codeql-disable-overlay",
          value: "false",
        },
      ] satisfies properties.GitHubPropertiesResponse,
    });
    const logger = getRunnerLogger(true);
    const warningSpy = sinon.spy(logger, "warning");
    const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
    const response = await properties.loadPropertiesFromApi(
      logger,
      mockRepositoryNwo,
    );
    t.deepEqual(response, {
      "github-codeql-disable-overlay": false,
    });
    t.true(warningSpy.notCalled);
  },
);

test.serial(
  "loadPropertiesFromApi throws if known property value is not a string",
  async (t) => {
    sinon.stub(api, "getRepositoryProperties").resolves({
      headers: {},
      status: 200,
      url: "",
      data: [{ property_name: "github-codeql-extra-queries", value: 123 }],
    });
    const logger = getRunnerLogger(true);
    const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
    await t.throwsAsync(
      properties.loadPropertiesFromApi(logger, mockRepositoryNwo),
      {
        message:
          /Unexpected value for repository property 'github-codeql-extra-queries' \(number\), got: 123/,
      },
    );
  },
);

test.serial(
  "loadPropertiesFromApi warns if boolean property has unexpected value",
  async (t) => {
    sinon.stub(api, "getRepositoryProperties").resolves({
      headers: {},
      status: 200,
      url: "",
      data: [
        {
          property_name: "github-codeql-disable-overlay",
          value: "yes",
        },
      ] satisfies properties.GitHubPropertiesResponse,
    });
    const logger = getRunnerLogger(true);
    const warningSpy = sinon.spy(logger, "warning");
    const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
    const response = await properties.loadPropertiesFromApi(
      logger,
      mockRepositoryNwo,
    );
    t.deepEqual(response, {
      "github-codeql-disable-overlay": false,
    });
    t.true(warningSpy.calledOnce);
    t.is(
      warningSpy.firstCall.args[0],
      "Repository property 'github-codeql-disable-overlay' has unexpected value 'yes'. Expected 'true' or 'false'. Defaulting to false.",
    );
  },
);

test.serial(
  "loadPropertiesFromApi warns if a repository property name starts with the common prefix, but is not recognised by us",
  async (t) => {
    process.env["GITHUB_EVENT_NAME"] = "push";
    const propertyName: string = `${properties.GITHUB_CODEQL_PROPERTY_PREFIX}unknown`;
    sinon.stub(api, "getRepositoryProperties").resolves({
      headers: {},
      status: 200,
      url: "",
      data: [
        {
          property_name: propertyName,
          value: "true",
        },
      ] satisfies properties.GitHubPropertiesResponse,
    });
    const logger = new RecordingLogger();
    const warningSpy = sinon.spy(logger, "warning");
    const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
    const response = await properties.loadPropertiesFromApi(
      logger,
      mockRepositoryNwo,
    );
    t.deepEqual(response, {});
    t.true(warningSpy.calledOnce);
    t.assert(
      warningSpy.firstCall.args[0]
        .toString()
        .startsWith(
          `Found repository properties ('${propertyName}'), which look like CodeQL Action repository properties`,
        ),
    );
  },
);
