import test from "ava";
import * as sinon from "sinon";

import * as apiClient from "../api-client";
import {
  checkExpectedLogMessages,
  getRecordingLogger,
  LoggedMessage,
  mockCCR,
  setupTests,
} from "../testing-utils";
import { initializeEnvironment, withTmpDir } from "../util";

import {
  assertAllFeaturesHaveDefaultValues,
  setUpFeatureFlagTests,
} from "./testing-util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
  mockCCR();
});

test("OfflineFeatures makes no API requests", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = setUpFeatureFlagTests(tmpDir, logger);
    t.is("OfflineFeatures", features.constructor.name);

    sinon
      .stub(apiClient, "getApiClient")
      .throws(new Error("Should not have called getApiClient"));

    await assertAllFeaturesHaveDefaultValues(t, features);
    checkExpectedLogMessages(t, loggedMessages, [
      "Querying feature flags is not currently supported in Copilot Code Review. Using offline data for all features.",
    ]);
  });
});
