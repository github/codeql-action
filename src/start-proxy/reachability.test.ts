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
import { ProxyInfo, ValidRegistry } from "./types";

setupTests(test);

class MockReachabilityBackend implements ReachabilityBackend {
  public async checkConnection(_registry: ValidRegistry): Promise<number> {
    return 200;
  }
}

const mavenRegistry: ValidRegistry = {
  type: "maven_registry",
  url: "https://repo.maven.apache.org/maven2/",
};

const nugetFeed: ValidRegistry = {
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
    .throws(new ReachabilityError(nugetFeed, 400));
  const messages = await withRecordingLoggerAsync(async (logger) => {
    const reachable = await checkConnections(logger, proxyInfo, backend);
    t.is(reachable.size, 1);
    t.true(reachable.has(mavenRegistry));
    t.false(reachable.has(nugetFeed));
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
    t.false(reachable.has(nugetFeed));
  });
  checkExpectedLogMessages(t, messages, [
    `Testing connection to ${mavenRegistry.url}`,
    `Successfully tested connection to ${mavenRegistry.url}`,
    `Testing connection to ${nugetFeed.url}`,
    `Connection test to ${nugetFeed.url} failed: Some generic error`,
    `Finished testing connections`,
  ]);
});
