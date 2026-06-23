import test from "ava";

import { ConfigurationError } from "../util";

import { parseRemoteFileAddress, RemoteFileAddress } from "./remote-file";

test("expandConfigFileInput accepts full remote addresses", async (t) => {
  t.deepEqual(parseRemoteFileAddress("owner/repo/path@ref"), {
    owner: "owner",
    repo: "repo",
    path: "path",
    ref: "ref",
  } satisfies RemoteFileAddress);

  t.deepEqual(
    parseRemoteFileAddress("owner/repo/path/to/codeql.yml@ref/feature"),
    {
      owner: "owner",
      repo: "repo",
      path: "path/to/codeql.yml",
      ref: "ref/feature",
    } satisfies RemoteFileAddress,
  );
});

test("expandConfigFileInput rejects invalid values", async (t) => {
  t.throws(() => parseRemoteFileAddress("  "), {
    instanceOf: ConfigurationError,
  });
  t.throws(() => parseRemoteFileAddress("repo:/absolute"), {
    instanceOf: ConfigurationError,
  });
  t.throws(() => parseRemoteFileAddress("repo:file.yml:unexpected"), {
    instanceOf: ConfigurationError,
  });
});
