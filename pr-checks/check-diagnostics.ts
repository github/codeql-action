import fs from "fs";
import path from "path";

import * as core from "@actions/core";
import { globSync } from "glob";

import * as sarif from "../src/sarif";

const DIAGNOSTIC_ID =
  process.env["DIAGNOSTIC_ID"] ?? "lang/diagnostics/example";
const DIAGNOSTIC_NAME = process.env["DIAGNOSTIC_NAME"] ?? "Diagnostic name";
const EXPECTED_MESSAGE = process.env["EXPECTED_MESSAGE"] ?? "Plaintext message";
const EXPECTED_LOCATIONS = Number.parseInt(
  process.env["EXPECTED_LOCATIONS"] ?? "1",
);

function checkStatusPageNotification(n: sarif.Notification) {
  const expectedMessage = EXPECTED_MESSAGE.trim();
  if (!n.message.text?.includes(expectedMessage)) {
    if (n.message.text !== undefined) {
      core.setFailed(
        `Expected the status page diagnostic to contain the message '${expectedMessage}', but found '${n.message.text.replaceAll("\n", "\\n")}'.`,
      );
    } else {
      core.setFailed(
        `Expected the status page diagnostic to contain the message '${expectedMessage}', but found nothing.`,
      );
    }
  }

  const locationCount = n.locations?.length ?? 0;
  if (locationCount !== EXPECTED_LOCATIONS) {
    core.setFailed(
      `Expected the status page diagnostic to have exactly ${EXPECTED_LOCATIONS} location(s), but found ${locationCount}.`,
    );
  }
}

function checkSarif(sarifFile: string) {
  core.info(`Checking SARIF file at '${sarifFile}'`);

  const log = JSON.parse(fs.readFileSync(sarifFile, "utf8")) as sarif.Log;
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
      n.descriptor?.id === DIAGNOSTIC_ID &&
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
      n.id === DIAGNOSTIC_ID &&
      n.name === DIAGNOSTIC_ID &&
      n.fullDescription?.text === DIAGNOSTIC_NAME,
  );
  if (diagnosticNotification.length !== 1) {
    core.setFailed(
      "Expected exactly one notification for this diagnostic in the " +
        `'runs[].tool.driver.notifications[]' SARIF property, but found ` +
        `${diagnosticNotification.length}. All notifications: ` +
        `${JSON.stringify(notifications)}.`,
    );
  }
}

const sarifPath = process.env["SARIF_PATH"];

if (sarifPath === undefined) {
  throw new Error(
    "The path to a SARIF file or directory must be set in 'SARIF_PATH'.",
  );
}

if (fs.statSync(sarifPath).isDirectory()) {
  const sarifFiles = globSync("**/*.sarif", {
    cwd: path.resolve(sarifPath),
    absolute: true,
  });

  if (sarifFiles.length < 1) {
    throw new Error(`Unable to find any .sarif files in '${sarifPath}'.`);
  }

  for (const sarifFile of sarifFiles) {
    checkSarif(sarifFile);
  }
} else {
  checkSarif(sarifPath);
}

core.info("Finished diagnostic export test");
