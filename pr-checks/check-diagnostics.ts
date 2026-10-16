import fs from "fs";

import * as core from "@actions/core";

import * as sarif from "../src/sarif";

function checkStatusPageNotification(n) {
  const expectedMessage = "Plaintext message";
  if (n.message.text !== expectedMessage) {
    core.setFailed(
      `Expected the status page diagnostic to have the message '${expectedMessage}', but found '${n.message.text}'.`,
    );
  }
  if (n.locations.length !== 1) {
    core.setFailed(
      `Expected the status page diagnostic to have exactly 1 location, but found ${n.locations.length}.`,
    );
  }
}

const sarifPath = process.env["SARIF_PATH"];

if (sarifPath === undefined) {
  throw new Error("The path to a SARIF file must be set in 'SARIF_PATH'.");
}

const log = JSON.parse(fs.readFileSync(sarifPath, "utf8")) as sarif.Log;
const run = log.runs[0];

if (run.invocations === undefined) {
  throw new Error("run.invocations is undefined");
}

const toolExecutionNotifications =
  run.invocations[0].toolExecutionNotifications;

if (toolExecutionNotifications === undefined) {
  throw new Error("toolExecutionNotifications is undefined");
}

const statusPageNotifications = toolExecutionNotifications.filter(
  (n) =>
    n.descriptor?.id === "lang/diagnostics/example" &&
    n.properties?.visibility?.statusPage,
);
if (statusPageNotifications.length !== 1) {
  core.setFailed(
    "Expected exactly one status page reporting descriptor for this diagnostic in the " +
      `'runs[].invocations[].toolExecutionNotifications[]' SARIF property, but found ` +
      `${statusPageNotifications.length}. All notification reporting descriptors: ` +
      `${JSON.stringify(toolExecutionNotifications)}.`,
  );
}
checkStatusPageNotification(statusPageNotifications[0]);

const notifications = run.tool.driver.notifications;

if (notifications === undefined) {
  throw new Error("notifications is undefined");
}

const diagnosticNotification = notifications.filter(
  (n) =>
    n.id === "lang/diagnostics/example" &&
    n.name === "lang/diagnostics/example" &&
    n.fullDescription?.text === "Diagnostic name",
);
if (diagnosticNotification.length !== 1) {
  core.setFailed(
    "Expected exactly one notification for this diagnostic in the " +
      `'runs[].tool.driver.notifications[]' SARIF property, but found ` +
      `${diagnosticNotification.length}. All notifications: ` +
      `${JSON.stringify(notifications)}.`,
  );
}

core.info("Finished diagnostic export test");
