import test from "ava";
import sinon from "sinon";

import { ActionsEnvVars } from "../actions-util";
import { getTestEnv } from "../testing-utils";
import { ConfigurationError } from "../util";

import {
  DEFAULT_CONFIG_FILE_NAME,
  DEFAULT_CONFIG_FILE_REF,
  parseRemoteFileAddress,
  RemoteFileAddress,
} from "./remote-file";

test("parseRemoteFileAddress accepts full remote addresses", async (t) => {
  const env = getTestEnv();

  t.deepEqual(parseRemoteFileAddress(env, "owner/repo/path@ref"), {
    owner: "owner",
    repo: "repo",
    path: "path",
    ref: "ref",
  } satisfies RemoteFileAddress);

  t.deepEqual(
    parseRemoteFileAddress(env, "owner/repo/path/to/codeql.yml@ref/feature"),
    {
      owner: "owner",
      repo: "repo",
      path: "path/to/codeql.yml",
      ref: "ref/feature",
    } satisfies RemoteFileAddress,
  );
});

test("parseRemoteFileAddress accepts remote address without an owner", async (t) => {
  const env = getTestEnv();
  const owner = "test-owner";
  const getRequired = sinon.stub(env, "getRequired");
  getRequired
    .withArgs(ActionsEnvVars.GITHUB_REPOSITORY)
    .returns(`${owner}/current-repo`);

  t.deepEqual(parseRemoteFileAddress(env, "repo@ref"), {
    owner,
    repo: "repo",
    path: DEFAULT_CONFIG_FILE_NAME,
    ref: "ref",
  } satisfies RemoteFileAddress);

  t.deepEqual(parseRemoteFileAddress(env, "repo"), {
    owner,
    repo: "repo",
    path: DEFAULT_CONFIG_FILE_NAME,
    ref: DEFAULT_CONFIG_FILE_REF,
  } satisfies RemoteFileAddress);
});

test("parseRemoteFileAddress throws for invalid `GITHUB_REPOSITORY`", async (t) => {
  const env = getTestEnv();
  const getRequired = sinon.stub(env, "getRequired");
  getRequired.withArgs(ActionsEnvVars.GITHUB_REPOSITORY).returns(`not-valid`);

  t.throws(() => parseRemoteFileAddress(env, "repo@ref"), {
    instanceOf: Error,
  });
});

test("parseRemoteFileAddress accepts remote address without a path", async (t) => {
  const env = getTestEnv();

  t.deepEqual(parseRemoteFileAddress(env, "owner/repo@ref"), {
    owner: "owner",
    repo: "repo",
    path: DEFAULT_CONFIG_FILE_NAME,
    ref: "ref",
  } satisfies RemoteFileAddress);

  t.deepEqual(parseRemoteFileAddress(env, "owner/repo"), {
    owner: "owner",
    repo: "repo",
    path: DEFAULT_CONFIG_FILE_NAME,
    ref: DEFAULT_CONFIG_FILE_REF,
  } satisfies RemoteFileAddress);
});

test("parseRemoteFileAddress accepts remote address without a ref", async (t) => {
  const env = getTestEnv();

  t.deepEqual(parseRemoteFileAddress(env, "owner/repo/path"), {
    owner: "owner",
    repo: "repo",
    path: "path",
    ref: DEFAULT_CONFIG_FILE_REF,
  } satisfies RemoteFileAddress);

  t.deepEqual(parseRemoteFileAddress(env, "owner/repo/path@"), {
    owner: "owner",
    repo: "repo",
    path: "path",
    ref: DEFAULT_CONFIG_FILE_REF,
  } satisfies RemoteFileAddress);
});

test("parseRemoteFileAddress rejects invalid values", async (t) => {
  const env = getTestEnv();
  const owner = "owner";
  const getRequired = sinon.stub(env, "getRequired");
  getRequired
    .withArgs(ActionsEnvVars.GITHUB_REPOSITORY)
    .returns(`${owner}/current-repo`);

  t.throws(() => parseRemoteFileAddress(env, "  "), {
    instanceOf: ConfigurationError,
  });
  t.throws(() => parseRemoteFileAddress(env, "repo//absolute"), {
    instanceOf: ConfigurationError,
  });
});
