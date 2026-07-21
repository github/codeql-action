import test from "ava";
import sinon from "sinon";

import { ActionsEnvVars } from "../environment";
import { callee } from "../testing-utils";
import { ConfigurationError } from "../util";

import {
  DEFAULT_CONFIG_FILE_NAME,
  DEFAULT_CONFIG_FILE_REF,
  parseRemoteFileAddress,
  RemoteFileAddress,
} from "./remote-file";

type ParseRemoteFileAddressTest = {
  input: string;
  expected: RemoteFileAddress;
};

test("parseRemoteFileAddress accepts full remote addresses", async (t) => {
  const target = callee(parseRemoteFileAddress);

  const expected: RemoteFileAddress = {
    owner: "owner",
    repo: "repo",
    path: "path",
    ref: "ref",
  };

  const oldFormatInputs: ParseRemoteFileAddressTest[] = [
    { input: "owner/repo/path@ref", expected },
    { input: "owner  /repo/path@ref", expected },
    { input: "owner/   repo/path@ref", expected },
    { input: "owner/repo   /path@ref", expected },
    { input: "owner/repo/   path@ref", expected },
    { input: "owner/repo/path   @ref", expected },
    { input: "owner/repo/path@   ref", expected },
    {
      input: "owner/repo/path/to/codeql.yml@ref/feature",
      expected: { ...expected, path: "path/to/codeql.yml", ref: "ref/feature" },
    },
    {
      input: "  owner/repo/path/to/codeql.yml@ref/feature  ",
      expected: { ...expected, path: "path/to/codeql.yml", ref: "ref/feature" },
    },
  ];

  for (const oldFormatInput of oldFormatInputs) {
    await target
      .withArgs(oldFormatInput.input)
      .passes(t.deepEqual, oldFormatInput.expected);
  }

  // New format.
  const newFormatInputs: ParseRemoteFileAddressTest[] = [
    { input: "owner/repo@ref:path", expected },
    { input: "owner  /repo@ref:path", expected },
    { input: "owner/   repo@ref:path", expected },
    { input: "owner/repo   @ref:path", expected },
    { input: "owner/repo@   ref:path", expected },
    { input: "owner/repo@ref   :path", expected },
    { input: "owner/repo@ref:   path", expected },
    {
      input: "owner/repo@ref/feature:path/to/codeql.yml",
      expected: { ...expected, path: "path/to/codeql.yml", ref: "ref/feature" },
    },
    {
      input: "  owner/repo@ref/feature:path/to/codeql.yml  ",
      expected: { ...expected, path: "path/to/codeql.yml", ref: "ref/feature" },
    },
  ];

  for (const newFormatInput of newFormatInputs) {
    const targetWithArgs = target.withArgs(newFormatInput.input);

    await targetWithArgs.passes(t.deepEqual, newFormatInput.expected);
  }
});

test("parseRemoteFileAddress accepts remote address without an owner", async (t) => {
  const owner = "test-owner";
  const target = callee(parseRemoteFileAddress).withEnv((env) => {
    const getRequired = sinon.stub(env, "getRequired");
    getRequired
      .withArgs(ActionsEnvVars.GITHUB_REPOSITORY)
      .returns(`${owner}/current-repo`);
  });

  const testCases: ParseRemoteFileAddressTest[] = [
    {
      input: "repo@ref:path.yml",
      expected: {
        owner,
        repo: "repo",
        path: "path.yml",
        ref: "ref",
      },
    },
    {
      input: "repo@ref",
      expected: {
        owner,
        repo: "repo",
        path: DEFAULT_CONFIG_FILE_NAME,
        ref: "ref",
      },
    },
    {
      input: "repo:path.yml",
      expected: {
        owner,
        repo: "repo",
        path: "path.yml",
        ref: DEFAULT_CONFIG_FILE_REF,
      },
    },
    {
      input: "repo",
      expected: {
        owner,
        repo: "repo",
        path: DEFAULT_CONFIG_FILE_NAME,
        ref: DEFAULT_CONFIG_FILE_REF,
      },
    },
  ];

  for (const testCase of testCases) {
    const targetWithArgs = target.withArgs(testCase.input);

    await targetWithArgs.passes(t.deepEqual, testCase.expected);
  }
});

test("parseRemoteFileAddress throws for invalid `GITHUB_REPOSITORY`", async (t) => {
  const getRequired: sinon.SinonStub = sinon.stub();
  getRequired.withArgs(ActionsEnvVars.GITHUB_REPOSITORY).returns(`not-valid`);

  const target = callee(parseRemoteFileAddress)
    .withArgs("repo@ref")
    .withEnv((env) => {
      sinon.define(env, "getRequired", getRequired);
    });

  await target.throws(t, { instanceOf: Error });

  t.assert(getRequired.calledOnceWith(ActionsEnvVars.GITHUB_REPOSITORY));
});

test("parseRemoteFileAddress accepts remote address without a path", async (t) => {
  const target = callee(parseRemoteFileAddress);

  const testCases: ParseRemoteFileAddressTest[] = [
    {
      input: "owner/repo@ref",
      expected: {
        owner: "owner",
        repo: "repo",
        path: DEFAULT_CONFIG_FILE_NAME,
        ref: "ref",
      },
    },
    {
      input: "owner/repo",
      expected: {
        owner: "owner",
        repo: "repo",
        path: DEFAULT_CONFIG_FILE_NAME,
        ref: DEFAULT_CONFIG_FILE_REF,
      },
    },
  ];

  for (const testCase of testCases) {
    const targetWithArgs = target.withArgs(testCase.input);

    await targetWithArgs.passes(t.deepEqual, testCase.expected);
  }
});

test("parseRemoteFileAddress accepts remote address without a ref", async (t) => {
  const target = callee(parseRemoteFileAddress).withArgs("owner/repo:path");

  await target.passes(t.deepEqual, {
    owner: "owner",
    repo: "repo",
    path: "path",
    ref: DEFAULT_CONFIG_FILE_REF,
  } satisfies RemoteFileAddress);
});

test("parseRemoteFileAddress rejects invalid values", async (t) => {
  const owner = "owner";
  const target = callee(parseRemoteFileAddress).withEnv((env) => {
    const getRequired = sinon.stub(env, "getRequired");
    getRequired
      .withArgs(ActionsEnvVars.GITHUB_REPOSITORY)
      .returns(`${owner}/current-repo`);
  });

  const testInputs = [
    "  ",
    "repo//absolute",
    "repo:/absolute",
    "/repo@ref",
    "   /repo@ref",
    "repo@",
    "repo:",
    "repo/",
    "/repo",
    ":path",
    "@ref",
    "@ref:path",
    "owner/@ref:path",
    "owner/@ref",
    "owner/:path",
  ];

  for (const testInput of testInputs) {
    const targetWithArgs = target.withArgs(testInput);

    await targetWithArgs.throws(t, {
      // When the new format is accepted, there are some more specific
      // errors in some cases. It is sufficient for us to check that
      // an exception is thrown.
      instanceOf: ConfigurationError,
    });
  }
});
