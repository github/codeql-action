import test from "ava";
import * as sinon from "sinon";

import {
  checkExpectedLogMessages,
  setupTests,
  withRecordingLoggerAsync,
} from "./../testing-utils";
import {
  checkConnections,
  ReachabilityBackend,
  ReachabilityError,
} from "./reachability";
import { ProxyInfo, Registry } from "./types";

setupTests(test);

class MockReachabilityBackend implements ReachabilityBackend {
  public async checkConnection(_url: URL): Promise<number> {
    return 200;
  }
}

const mavenRegistry: Registry = {
  type: "maven_registry",
  url: "https://repo.maven.apache.org/maven2/",
};

const nugetFeed: Registry = {
  type: "nuget_feed",
  url: "https://api.nuget.org/v3/index.json",
};

const proxyInfo: ProxyInfo = {
  host: "127.0.0.1",
  port: 1080,
  cert: "",
  registries: [mavenRegistry, nugetFeed],
};

test("checkConnections - basic functionality", async (t) => {
  const backend = new MockReachabilityBackend();
  const messages = await withRecordingLoggerAsync(async (logger) => {
    const reachable = await checkConnections(logger, proxyInfo, backend);
    t.is(reachable.size, proxyInfo.registries.length);
    t.true(reachable.has(mavenRegistry));
    t.true(reachable.has(nugetFeed));
  });
  checkExpectedLogMessages(t, messages, [
    `Testing connection to ${mavenRegistry.url}`,
    `Successfully tested connection to ${mavenRegistry.url}`,
    `Testing connection to ${nugetFeed.url}`,
    `Successfully tested connection to ${nugetFeed.url}`,
    `Finished testing connections`,
  ]);
});

test("checkConnections - excludes failed status codes", async (t) => {
  const backend = new MockReachabilityBackend();
  sinon
    .stub(backend, "checkConnection")
    .onSecondCall()
    .throws(new ReachabilityError(400));
  const messages = await withRecordingLoggerAsync(async (logger) => {
    const reachable = await checkConnections(logger, proxyInfo, backend);
    t.is(reachable.size, 1);
    t.true(reachable.has(mavenRegistry));
  });
  checkExpectedLogMessages(t, messages, [
    `Testing connection to ${mavenRegistry.url}`,
    `Successfully tested connection to ${mavenRegistry.url}`,
    `Testing connection to ${nugetFeed.url}`,
    `Connection test to ${nugetFeed.url} failed. (400)`,
    `Finished testing connections`,
  ]);
});

test("checkConnections - handles other exceptions", async (t) => {
  const backend = new MockReachabilityBackend();
  sinon
    .stub(backend, "checkConnection")
    .onSecondCall()
    .throws(new Error("Some generic error"));
  const messages = await withRecordingLoggerAsync(async (logger) => {
    const reachable = await checkConnections(logger, proxyInfo, backend);
    t.is(reachable.size, 1);
    t.true(reachable.has(mavenRegistry));
  });
  checkExpectedLogMessages(t, messages, [
    `Testing connection to ${mavenRegistry.url}`,
    `Successfully tested connection to ${mavenRegistry.url}`,
    `Testing connection to ${nugetFeed.url}`,
    `Connection test to ${nugetFeed.url} failed: Some generic error`,
    `Finished testing connections`,
  ]);
});

test("checkConnections - handles invalid URLs", async (t) => {
  const backend = new MockReachabilityBackend();
  const messages = await withRecordingLoggerAsync(async (logger) => {
    const reachable = await checkConnections(
      logger,
      {
        ...proxyInfo,
        registries: [
          {
            type: "nuget_feed",
            url: "localhost",
          },
        ],
      },
      backend,
    );
    t.is(reachable.size, 0);
  });
  checkExpectedLogMessages(t, messages, [
    `Skipping check for localhost since it is not a valid URL.`,
    `Finished testing connections`,
  ]);
});
