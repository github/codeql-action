import test from "ava";

import { getRunnerLogger } from "./logging";
import * as startProxyExports from "./start-proxy";
import { setupTests } from "./testing-utils";

setupTests(test);

test("getCredentials prefers registriesCredentials over registrySecrets", async (t) => {
  const registryCredentials = Buffer.from(
    JSON.stringify([
      { type: "npm_registry", host: "npm.pkg.github.com", token: "abc" },
    ]),
  ).toString("base64");
  const registrySecrets = JSON.stringify([
    { type: "npm_registry", host: "registry.npmjs.org", token: "def" },
  ]);

  const credentials = startProxyExports.getCredentials(
    getRunnerLogger(true),
    registrySecrets,
    registryCredentials,
    undefined,
  );
  t.is(credentials.length, 1);
  t.is(credentials[0].host, "npm.pkg.github.com");
});

test("getCredentials throws error when credential missing host and url", async (t) => {
  const registryCredentials = Buffer.from(
    JSON.stringify([{ type: "npm_registry", token: "abc" }]),
  ).toString("base64");

  t.throws(
    () =>
      startProxyExports.getCredentials(
        getRunnerLogger(true),
        undefined,
        registryCredentials,
        undefined,
      ),
    {
      message: "Invalid credentials - must specify host or url",
    },
  );
});

test("getCredentials filters by language when specified", async (t) => {
  const mixedCredentials = [
    { type: "npm_registry", host: "npm.pkg.github.com", token: "abc" },
    { type: "maven_repository", host: "maven.pkg.github.com", token: "def" },
    { type: "nuget_feed", host: "nuget.pkg.github.com", token: "ghi" },
  ];

  const credentials = startProxyExports.getCredentials(
    getRunnerLogger(true),
    undefined,
    Buffer.from(JSON.stringify(mixedCredentials)).toString("base64"),
    "java",
  );
  t.is(credentials.length, 1);
  t.is(credentials[0].type, "maven_repository");
});

test("getCredentials returns all credentials when no language specified", async (t) => {
  const mixedCredentials = [
    { type: "npm_registry", host: "npm.pkg.github.com", token: "abc" },
    { type: "maven_repository", host: "maven.pkg.github.com", token: "def" },
    { type: "nuget_feed", host: "nuget.pkg.github.com", token: "ghi" },
  ];
  const credentialsInput = Buffer.from(
    JSON.stringify(mixedCredentials),
  ).toString("base64");

  const credentials = startProxyExports.getCredentials(
    getRunnerLogger(true),
    undefined,
    credentialsInput,
    undefined,
  );
  t.is(credentials.length, 3);
});

test("getCredentials throws an error when non-printable characters are used", async (t) => {
  const invalidCredentials = [
    { type: "nuget_feed", host: "1nuget.pkg.github.com", token: "abc\u0000" }, // Non-printable character in token
    { type: "nuget_feed", host: "2nuget.pkg.github.com\u0001" }, // Non-printable character in host
    {
      type: "nuget_feed",
      host: "3nuget.pkg.github.com",
      password: "ghi\u0002",
    }, // Non-printable character in password
    { type: "nuget_feed", host: "4nuget.pkg.github.com", password: "ghi\x00" }, // Non-printable character in password
  ];

  for (const invalidCredential of invalidCredentials) {
    const credentialsInput = Buffer.from(
      JSON.stringify([invalidCredential]),
    ).toString("base64");

    t.throws(
      () =>
        startProxyExports.getCredentials(
          getRunnerLogger(true),
          undefined,
          credentialsInput,
          undefined,
        ),
      {
        message:
          "Invalid credentials - fields must contain only printable characters",
      },
    );
  }
});
