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
    ] satisfies properties.RepositoryProperty[],
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
    ] satisfies properties.RepositoryProperty[],
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
