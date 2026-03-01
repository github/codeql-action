import { ChildProcess } from "child_process";
import { EventEmitter } from "events";

import * as core from "@actions/core";
import test from "ava";
import sinon from "sinon";

import { getRunnerLogger } from "../logging";
import { setupTests } from "../testing-utils";
import { ProxyConfig } from "../start-proxy";
import { startProxy } from "./launcher";

setupTests(test);

class FakeChildProcess extends EventEmitter {
  public pid: number | undefined = 1234;
  public exitCode: number | null = null;
  public stdin: { write: sinon.SinonStub; end: sinon.SinonStub };

  constructor() {
    super();
    this.stdin = {
      write: sinon.stub().returns(true),
      end: sinon.stub(),
    };
  }

  unref() {
    return undefined;
  }
}

function makeConfig(): ProxyConfig {
  return {
    all_credentials: [
      {
        type: "npm_registry",
        host: "npm.pkg.github.com",
        url: "https://npm.pkg.github.com",
        token: "secret-token",
      },
      {
        type: "maven_repository",
        host: "maven.pkg.github.com",
        url: undefined,
      },
    ],
    ca: {
      cert: "CERT",
      key: "KEY",
    },
  };
}

test("startProxy throws explicit error when retries are exhausted", async (t) => {
  const fakeSpawn = sinon.stub().callsFake(() => {
    const process = new FakeChildProcess();
    // Emit exit on next event loop iteration, ensuring it fires during the delay
    setImmediate(() => {
      process.emit("exit", 1);
    });
    return process as unknown as ChildProcess;
  });
  const setOutputStub = sinon.stub(core, "setOutput");
  sinon.stub(core, "saveState");

  const error = await t.throwsAsync(() =>
    startProxy(
      "proxy-bin",
      makeConfig(),
      "proxy.log",
      getRunnerLogger(true),
      fakeSpawn as any,
    ),
  );

  t.truthy(error);
  t.true(
    error!.message.includes("Failed to start proxy after 5 attempts"),
    `Expected "Failed to start proxy after 5 attempts" but got: ${error?.message}`,
  );
  t.true(
    error!.message.includes("last exit code: 1"),
    `Expected exit code in message but got: ${error?.message}`,
  );
  t.true(setOutputStub.notCalled);
});

test("startProxy rethrows spawn errors", async (t) => {
  const expectedError = new Error("spawn failed");
  const fakeSpawn = sinon.stub().callsFake(() => {
    const process = new FakeChildProcess();
    // Emit error on next event loop iteration
    setImmediate(() => {
      process.emit("error", expectedError);
    });
    return process as unknown as ChildProcess;
  });
  sinon.stub(core, "setOutput");
  sinon.stub(core, "saveState");

  const error = await t.throwsAsync(() =>
    startProxy(
      "proxy-bin",
      makeConfig(),
      "proxy.log",
      getRunnerLogger(true),
      fakeSpawn as any,
    ),
  );

  t.is(error, expectedError);
});

test("startProxy succeeds and sets outputs when process remains alive", async (t) => {
  const fakeSpawn = sinon.stub().callsFake(() => {
    const process = new FakeChildProcess();
    process.exitCode = null; // Explicitly null: process stays alive
    // Don't emit any events - process should remain active
    return process as unknown as ChildProcess;
  });
  const setOutputStub = sinon.stub(core, "setOutput");
  sinon.stub(core, "saveState");

  const proxyInfo = await startProxy(
    "proxy-bin",
    makeConfig(),
    "proxy.log",
    getRunnerLogger(true),
    fakeSpawn as any,
  );

  t.is(proxyInfo.host, "127.0.0.1");
  t.is(proxyInfo.port, 49152);
  t.is(proxyInfo.cert, "CERT");
  t.deepEqual(proxyInfo.registries, [
    {
      type: "npm_registry",
      url: "https://npm.pkg.github.com",
    },
  ]);

  sinon.assert.calledWith(setOutputStub, "proxy_host", "127.0.0.1");
  sinon.assert.calledWith(setOutputStub, "proxy_port", "49152");
  sinon.assert.calledWith(setOutputStub, "proxy_ca_certificate", "CERT");
  sinon.assert.calledWith(
    setOutputStub,
    "proxy_urls",
    JSON.stringify([{ type: "npm_registry", url: "https://npm.pkg.github.com" }]),
  );
});
