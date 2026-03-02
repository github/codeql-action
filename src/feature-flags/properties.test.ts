import test from "ava";
import * as sinon from "sinon";

import * as api from "../api-client";
import { getRunnerLogger } from "../logging";
import { parseRepositoryNwo } from "../repository";
import { setupTests } from "../testing-utils";
import * as util from "../util";

import * as properties from "./properties";

setupTests(test);

test("loadPropertiesFromApi throws if response data is not an array", async (t) => {
  sinon.stub(api, "getRepositoryProperties").resolves({
    headers: {},
    status: 200,
    url: "",
    data: {},
  });
  const logger = getRunnerLogger(true);
  const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
  await t.throwsAsync(
    properties.loadPropertiesFromApi(
      {
        type: util.GitHubVariant.DOTCOM,
      },
      logger,
      mockRepositoryNwo,
    ),
    {
      message: /Expected repository properties API to return an array/,
    },
  );
});

test("loadPropertiesFromApi throws if response data contains unexpected objects", async (t) => {
  sinon.stub(api, "getRepositoryProperties").resolves({
    headers: {},
    status: 200,
    url: "",
    data: [{}],
  });
  const logger = getRunnerLogger(true);
  const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
  await t.throwsAsync(
    properties.loadPropertiesFromApi(
      {
        type: util.GitHubVariant.DOTCOM,
      },
      logger,
      mockRepositoryNwo,
    ),
    {
      message: /Expected repository property object to have a 'property_name'/,
    },
  );
});

test("loadPropertiesFromApi returns empty object if on GHES", async (t) => {
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
    {
      type: util.GitHubVariant.GHES,
      version: "",
    },
    logger,
    mockRepositoryNwo,
  );
  t.deepEqual(response, {});
});

test("loadPropertiesFromApi loads known properties", async (t) => {
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
    {
      type: util.GitHubVariant.DOTCOM,
    },
    logger,
    mockRepositoryNwo,
  );
  t.deepEqual(response, { "github-codeql-extra-queries": "+queries" });
});

test("loadPropertiesFromApi parses true boolean property", async (t) => {
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
    {
      type: util.GitHubVariant.DOTCOM,
    },
    logger,
    mockRepositoryNwo,
  );
  t.deepEqual(response, {
    "github-codeql-disable-overlay": true,
    "github-codeql-extra-queries": "+queries",
  });
  t.true(warningSpy.notCalled);
});

test("loadPropertiesFromApi parses false boolean property", async (t) => {
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
    {
      type: util.GitHubVariant.DOTCOM,
    },
    logger,
    mockRepositoryNwo,
  );
  t.deepEqual(response, {
    "github-codeql-disable-overlay": false,
  });
  t.true(warningSpy.notCalled);
});

test("loadPropertiesFromApi throws if property value is not a string", async (t) => {
  sinon.stub(api, "getRepositoryProperties").resolves({
    headers: {},
    status: 200,
    url: "",
    data: [{ property_name: "github-codeql-extra-queries", value: 123 }],
  });
  const logger = getRunnerLogger(true);
  const mockRepositoryNwo = parseRepositoryNwo("owner/repo");
  await t.throwsAsync(
    properties.loadPropertiesFromApi(
      {
        type: util.GitHubVariant.DOTCOM,
      },
      logger,
      mockRepositoryNwo,
    ),
    {
      message:
        /Expected repository property 'github-codeql-extra-queries' to have a string value/,
    },
  );
});

test("loadPropertiesFromApi warns if boolean property has unexpected value", async (t) => {
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
    {
      type: util.GitHubVariant.DOTCOM,
    },
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
});
