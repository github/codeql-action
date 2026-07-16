import * as github from "@actions/github";
import test from "ava";
import sinon from "sinon";

import * as api from "../api-client";
import { RegistryProxyVars } from "../environment";
import { Feature } from "../feature-flags";
import { RepositoryPropertyName } from "../feature-flags/properties";
import {
  callee,
  SAMPLE_DOTCOM_API_DETAILS,
  setupTests,
} from "../testing-utils";

import { getConfigFileInput, getRemoteConfig } from "./file";

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

  // Even though both an input and repository property are configured,
  // we prefer the direct input to the Action.
  await callee(getConfigFileInput)
    .withFeatures([Feature.ConfigFileRepositoryProperty])
    .withActions((actionsEnv) => {
      sinon
        .stub(actionsEnv, "getOptionalInput")
        .withArgs("config-file")
        .returns(testInput);
    })
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

test.serial("getRemoteConfig uses proxy when it is supposed to", async (t) => {
  const client = github.getOctokit("123");
  const response = {
    data: {
      content: Buffer.from("disable-default-queries: false").toString("base64"),
    },
  };
  sinon
    .stub(client.rest.repos, "getContent")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    .resolves(response as any);

  // We stub `getApiClientWithExternalAuth` so that it throws if no
  // proxy is provided and returns the client otherwise. This allows us
  // to verify the result in the following test cases.
  const errorMessage = "No `proxy` was provided by the caller.";
  sinon
    .stub(api, "getApiClientWithExternalAuth")
    .callsFake((_details, proxy) => {
      // Throw if proxy isn't defined.
      if (proxy === undefined) {
        throw new Error(errorMessage);
      }
      // Otherwise return the client object.
      return client;
    });

  const target = callee(getRemoteConfig)
    .withDefaultActionsEnv()
    .withArgs("file.yml", SAMPLE_DOTCOM_API_DETAILS);

  // Should use it when the FF is enabled and the environment variables are set.
  await target
    .withFeatures([Feature.ProxyApiRequests, Feature.NewRemoteFileAddresses])
    .withEnv((env) => {
      env.set(RegistryProxyVars.PROXY_HOST, "localhost");
      env.set(RegistryProxyVars.PROXY_PORT, "1234");
    })
    .logs(t, "Using private registry proxy at 'http://localhost:1234'")
    .passes(t.truthy);

  // But not when the FF is not enabled.
  await target
    .withFeatures([Feature.NewRemoteFileAddresses])
    .withEnv((env) => {
      env.set(RegistryProxyVars.PROXY_HOST, "localhost");
      env.set(RegistryProxyVars.PROXY_PORT, "1234");
    })
    .notLogs(t, "Using private registry proxy at 'http://localhost:1234'")
    .throws(t, { message: errorMessage });

  // And not when the environment variables aren't set.
  await target
    .withFeatures([Feature.ProxyApiRequests, Feature.NewRemoteFileAddresses])
    .notLogs(t, "Using private registry proxy at 'http://localhost:1234'")
    .throws(t, { message: errorMessage });
});
