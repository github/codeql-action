import * as fs from "fs";
import * as os from "os";
import path from "path";

import test from "ava";

import { getRunnerLogger } from "./logging";
import { getRecordingLogger, LoggedMessage, setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test("getToolNames", (t) => {
  const input = fs.readFileSync(
    `${__dirname}/../src/testdata/tool-names.sarif`,
    "utf8",
  );
  const toolNames = util.getToolNames(JSON.parse(input) as util.SarifFile);
  t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});

const GET_MEMORY_FLAG_TESTS = [
  {
    input: undefined,
    totalMemoryMb: 8 * 1024,
    platform: "linux",
    expectedMemoryValue: 7 * 1024,
    expectedMemoryValueWithScaling: 7 * 1024,
  },
  {
    input: undefined,
    totalMemoryMb: 8 * 1024,
    platform: "win32",
    expectedMemoryValue: 6.5 * 1024,
    expectedMemoryValueWithScaling: 6.5 * 1024,
  },
  {
    input: "",
    totalMemoryMb: 8 * 1024,
    platform: "linux",
    expectedMemoryValue: 7 * 1024,
    expectedMemoryValueWithScaling: 7 * 1024,
  },
  {
    input: "512",
    totalMemoryMb: 8 * 1024,
    platform: "linux",
    expectedMemoryValue: 512,
    expectedMemoryValueWithScaling: 512,
  },
  {
    input: undefined,
    totalMemoryMb: 64 * 1024,
    platform: "linux",
    expectedMemoryValue: 63 * 1024,
    expectedMemoryValueWithScaling: 61644, // Math.floor(1024 * (64 - 1 - 0.05 * (64 - 8)))
  },
  {
    input: undefined,
    totalMemoryMb: 64 * 1024,
    platform: "win32",
    expectedMemoryValue: 62.5 * 1024,
    expectedMemoryValueWithScaling: 61132, // Math.floor(1024 * (64 - 1.5 - 0.05 * (64 - 8)))
  },
];

for (const {
  input,
  totalMemoryMb,
  platform,
  expectedMemoryValue,
  expectedMemoryValueWithScaling,
} of GET_MEMORY_FLAG_TESTS) {
  test(
    `Memory flag value is ${expectedMemoryValue} without scaling and ${expectedMemoryValueWithScaling} with scaling ` +
      `for ${
        input ?? "no user input"
      } on ${platform} with ${totalMemoryMb} MB total system RAM`,
    async (t) => {
      for (const withScaling of [true, false]) {
        const flag = util.getMemoryFlagValueForPlatform(
          input,
          totalMemoryMb * 1024 * 1024,
          platform,
          withScaling,
        );
        t.deepEqual(
          flag,
          withScaling ? expectedMemoryValueWithScaling : expectedMemoryValue,
        );
      }
    },
  );
}

test("getMemoryFlag() throws if the ram input is < 0 or NaN", async (t) => {
  for (const input of ["-1", "hello!"]) {
    t.throws(() => util.getMemoryFlag(input, false));
  }
});

test("getAddSnippetsFlag() should return the correct flag", (t) => {
  t.deepEqual(util.getAddSnippetsFlag(true), "--sarif-add-snippets");
  t.deepEqual(util.getAddSnippetsFlag("true"), "--sarif-add-snippets");

  t.deepEqual(util.getAddSnippetsFlag(false), "--no-sarif-add-snippets");
  t.deepEqual(util.getAddSnippetsFlag(undefined), "--no-sarif-add-snippets");
  t.deepEqual(util.getAddSnippetsFlag("false"), "--no-sarif-add-snippets");
  t.deepEqual(util.getAddSnippetsFlag("foo bar"), "--no-sarif-add-snippets");
});

test("getThreadsFlag() should return the correct --threads flag", (t) => {
  const numCpus = os.cpus().length;

  const tests: Array<[string | undefined, string]> = [
    ["0", "--threads=0"],
    ["1", "--threads=1"],
    [undefined, `--threads=${numCpus}`],
    ["", `--threads=${numCpus}`],
    [`${numCpus + 1}`, `--threads=${numCpus}`],
    [`${-numCpus - 1}`, `--threads=${-numCpus}`],
  ];

  for (const [input, expectedFlag] of tests) {
    const flag = util.getThreadsFlag(input, getRunnerLogger(true));
    t.deepEqual(flag, expectedFlag);
  }
});

test("getThreadsFlag() throws if the threads input is not an integer", (t) => {
  t.throws(() => util.getThreadsFlag("hello!", getRunnerLogger(true)));
});

test("getExtraOptionsEnvParam() succeeds on valid JSON with invalid options (for now)", (t) => {
  const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;

  const options = { foo: 42 };

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);

  t.deepEqual(util.getExtraOptionsEnvParam(), <any>options);

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});

test("getExtraOptionsEnvParam() succeeds on valid options", (t) => {
  const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;

  const options = { database: { init: ["--debug"] } };
  process.env.CODEQL_ACTION_EXTRA_OPTIONS = JSON.stringify(options);

  t.deepEqual(util.getExtraOptionsEnvParam(), options);

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});

test("getExtraOptionsEnvParam() fails on invalid JSON", (t) => {
  const origExtraOptions = process.env.CODEQL_ACTION_EXTRA_OPTIONS;

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = "{{invalid-json}}";
  t.throws(util.getExtraOptionsEnvParam);

  process.env.CODEQL_ACTION_EXTRA_OPTIONS = origExtraOptions;
});

test("parseGitHubUrl", (t) => {
  t.deepEqual(util.parseGitHubUrl("github.com"), "https://github.com");
  t.deepEqual(util.parseGitHubUrl("https://github.com"), "https://github.com");
  t.deepEqual(
    util.parseGitHubUrl("https://api.github.com"),
    "https://github.com",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.com/foo/bar"),
    "https://github.com",
  );

  t.deepEqual(
    util.parseGitHubUrl("github.example.com"),
    "https://github.example.com/",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com"),
    "https://github.example.com/",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://api.github.example.com"),
    "https://github.example.com/",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com/api/v3"),
    "https://github.example.com/",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com:1234"),
    "https://github.example.com:1234/",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://api.github.example.com:1234"),
    "https://github.example.com:1234/",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com:1234/api/v3"),
    "https://github.example.com:1234/",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com/base/path"),
    "https://github.example.com/base/path/",
  );
  t.deepEqual(
    util.parseGitHubUrl("https://github.example.com/base/path/api/v3"),
    "https://github.example.com/base/path/",
  );

  t.throws(() => util.parseGitHubUrl(""), {
    message: '"" is not a valid URL',
  });
  t.throws(() => util.parseGitHubUrl("ssh://github.com"), {
    message: '"ssh://github.com" is not a http or https URL',
  });
  t.throws(() => util.parseGitHubUrl("http:///::::433"), {
    message: '"http:///::::433" is not a valid URL',
  });
});

test("allowed API versions", async (t) => {
  t.is(util.apiVersionInRange("1.33.0", "1.33", "2.0"), undefined);
  t.is(util.apiVersionInRange("1.33.1", "1.33", "2.0"), undefined);
  t.is(util.apiVersionInRange("1.34.0", "1.33", "2.0"), undefined);
  t.is(util.apiVersionInRange("2.0.0", "1.33", "2.0"), undefined);
  t.is(util.apiVersionInRange("2.0.1", "1.33", "2.0"), undefined);
  t.is(
    util.apiVersionInRange("1.32.0", "1.33", "2.0"),
    util.DisallowedAPIVersionReason.ACTION_TOO_NEW,
  );
  t.is(
    util.apiVersionInRange("2.1.0", "1.33", "2.0"),
    util.DisallowedAPIVersionReason.ACTION_TOO_OLD,
  );
});

test("doesDirectoryExist", async (t) => {
  // Returns false if no file/dir of this name exists
  t.false(util.doesDirectoryExist("non-existent-file.txt"));

  await util.withTmpDir(async (tmpDir: string) => {
    // Returns false if file
    const testFile = `${tmpDir}/test-file.txt`;
    fs.writeFileSync(testFile, "");
    t.false(util.doesDirectoryExist(testFile));

    // Returns true if directory
    fs.writeFileSync(`${tmpDir}/nested-test-file.txt`, "");
    t.true(util.doesDirectoryExist(tmpDir));
  });
});

test("listFolder", async (t) => {
  // Returns empty if not a directory
  t.deepEqual(util.listFolder("not-a-directory"), []);

  // Returns empty if directory is empty
  await util.withTmpDir(async (emptyTmpDir: string) => {
    t.deepEqual(util.listFolder(emptyTmpDir), []);
  });

  // Returns all file names in directory
  await util.withTmpDir(async (tmpDir: string) => {
    const nestedDir = fs.mkdtempSync(path.join(tmpDir, "nested-"));
    fs.writeFileSync(path.resolve(nestedDir, "nested-test-file.txt"), "");
    fs.writeFileSync(path.resolve(tmpDir, "test-file-1.txt"), "");
    fs.writeFileSync(path.resolve(tmpDir, "test-file-2.txt"), "");
    fs.writeFileSync(path.resolve(tmpDir, "test-file-3.txt"), "");

    t.deepEqual(util.listFolder(tmpDir), [
      path.resolve(nestedDir, "nested-test-file.txt"),
      path.resolve(tmpDir, "test-file-1.txt"),
      path.resolve(tmpDir, "test-file-2.txt"),
      path.resolve(tmpDir, "test-file-3.txt"),
    ]);
  });
});

const longTime = 999_999;
const shortTime = 10;

test("withTimeout on long task", async (t) => {
  let longTaskTimedOut = false;
  const longTask = new Promise((resolve) => {
    setTimeout(() => {
      resolve(42);
    }, longTime);
  });
  const result = await util.withTimeout(shortTime, longTask, () => {
    longTaskTimedOut = true;
  });
  t.deepEqual(longTaskTimedOut, true);
  t.deepEqual(result, undefined);
});

test("withTimeout on short task", async (t) => {
  let shortTaskTimedOut = false;
  const shortTask = new Promise((resolve) => {
    setTimeout(() => {
      resolve(99);
    }, shortTime);
  });
  const result = await util.withTimeout(longTime, shortTask, () => {
    shortTaskTimedOut = true;
  });
  t.deepEqual(shortTaskTimedOut, false);
  t.deepEqual(result, 99);
});

test("withTimeout doesn't call callback if promise resolves", async (t) => {
  let shortTaskTimedOut = false;
  const shortTask = new Promise((resolve) => {
    setTimeout(() => {
      resolve(99);
    }, shortTime);
  });
  const result = await util.withTimeout(100, shortTask, () => {
    shortTaskTimedOut = true;
  });
  await new Promise((r) => setTimeout(r, 200));
  t.deepEqual(shortTaskTimedOut, false);
  t.deepEqual(result, 99);
});

function createMockSarifWithNotification(
  locations: util.SarifLocation[],
): util.SarifFile {
  return {
    runs: [
      {
        tool: {
          driver: {
            name: "CodeQL",
          },
        },
        invocations: [
          {
            toolExecutionNotifications: [
              {
                locations,
              },
            ],
          },
        ],
      },
    ],
  };
}

const stubLocation: util.SarifLocation = {
  physicalLocation: {
    artifactLocation: {
      uri: "file1",
    },
  },
};

test("fixInvalidNotifications leaves notifications with unique locations alone", (t) => {
  const messages: LoggedMessage[] = [];
  const result = util.fixInvalidNotifications(
    createMockSarifWithNotification([stubLocation]),
    getRecordingLogger(messages),
  );
  t.deepEqual(result, createMockSarifWithNotification([stubLocation]));
  t.is(messages.length, 1);
  t.deepEqual(messages[0], {
    type: "debug",
    message: "No duplicate locations found in SARIF notification objects.",
  });
});

test("fixInvalidNotifications removes duplicate locations", (t) => {
  const messages: LoggedMessage[] = [];
  const result = util.fixInvalidNotifications(
    createMockSarifWithNotification([stubLocation, stubLocation]),
    getRecordingLogger(messages),
  );
  t.deepEqual(result, createMockSarifWithNotification([stubLocation]));
  t.is(messages.length, 1);
  t.deepEqual(messages[0], {
    type: "info",
    message: "Removed 1 duplicate locations from SARIF notification objects.",
  });
});
