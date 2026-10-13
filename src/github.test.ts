import test from "ava";

import { ActionsEnvVars } from "./environment";
import * as github from "./github";
import { getTestEnv, setupTests } from "./testing-utils";

setupTests(test);

test("parseGitHubUrl", (t) => {
  t.deepEqual(github.parseGitHubUrl("github.com"), "https://github.com");
  t.deepEqual(
    github.parseGitHubUrl("https://github.com"),
    "https://github.com",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://api.github.com"),
    "https://github.com",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://github.com/foo/bar"),
    "https://github.com",
  );

  t.deepEqual(
    github.parseGitHubUrl("github.example.com"),
    "https://github.example.com/",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://github.example.com"),
    "https://github.example.com/",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://api.github.example.com"),
    "https://github.example.com/",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://github.example.com/api/v3"),
    "https://github.example.com/",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://github.example.com:1234"),
    "https://github.example.com:1234/",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://api.github.example.com:1234"),
    "https://github.example.com:1234/",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://github.example.com:1234/api/v3"),
    "https://github.example.com:1234/",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://github.example.com/base/path"),
    "https://github.example.com/base/path/",
  );
  t.deepEqual(
    github.parseGitHubUrl("https://github.example.com/base/path/api/v3"),
    "https://github.example.com/base/path/",
  );

  t.throws(() => github.parseGitHubUrl(""), {
    message: '"" is not a valid URL',
  });
  t.throws(() => github.parseGitHubUrl("ssh://github.com"), {
    message: '"ssh://github.com" is not a http or https URL',
  });
  t.throws(() => github.parseGitHubUrl("http:///::::433"), {
    message: '"http:///::::433" is not a valid URL',
  });
});

test("getCurrentInstance throws if required env vars aren't set", (t) => {
  t.throws(() => github.getCurrentInstance(getTestEnv()));
  t.throws(() => {
    const env = getTestEnv({
      [ActionsEnvVars.GITHUB_SERVER_URL]: "https://localhost",
    });
    github.getCurrentInstance(env);
  });
  t.throws(() => {
    const env = getTestEnv({
      [ActionsEnvVars.GITHUB_API_URL]: "https://api.localhost",
    });
    github.getCurrentInstance(env);
  });
});

test("getCurrentInstance constructs instance from environment", (t) => {
  const url = "https://localhost";
  const apiUrl = "https://api.localhost";

  const env = getTestEnv({
    [ActionsEnvVars.GITHUB_SERVER_URL]: url,
    [ActionsEnvVars.GITHUB_API_URL]: apiUrl,
  });
  const instance = github.getCurrentInstance(env);

  t.is(instance.url, url);
  t.is(instance.apiURL, apiUrl);
});

test("getCurrentInstance constructs dotcom instance with dotcom env vars", (t) => {
  const env = getTestEnv({
    [ActionsEnvVars.GITHUB_SERVER_URL]: github.GITHUB_DOTCOM_URL,
    [ActionsEnvVars.GITHUB_API_URL]: github.GITHUB_DOTCOM_API_URL,
  });
  const instance = github.getCurrentInstance(env);
  const dotcomInstance = github.getDotcomInstance();

  t.deepEqual(dotcomInstance, instance);
});
