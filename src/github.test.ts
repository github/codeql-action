import test from "ava";

import * as github from "./github";
import { setupTests } from "./testing-utils";

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
