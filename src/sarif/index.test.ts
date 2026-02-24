import * as fs from "fs";

import test from "ava";

import {
  getRecordingLogger,
  LoggedMessage,
  setupTests,
} from "../testing-utils";

import {
  fixInvalidNotifications,
  getToolNames,
  SarifLocation,
  type SarifFile,
} from ".";

setupTests(test);

test("getToolNames", (t) => {
  const input = fs.readFileSync(
    `${__dirname}/../../src/testdata/tool-names.sarif`,
    "utf8",
  );
  const toolNames = getToolNames(JSON.parse(input) as SarifFile);
  t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});

function createMockSarifWithNotification(
  locations: SarifLocation[],
): SarifFile {
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

const stubLocation: SarifLocation = {
  physicalLocation: {
    artifactLocation: {
      uri: "file1",
    },
  },
};

test("fixInvalidNotifications leaves notifications with unique locations alone", (t) => {
  const messages: LoggedMessage[] = [];
  const result = fixInvalidNotifications(
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
  const result = fixInvalidNotifications(
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
