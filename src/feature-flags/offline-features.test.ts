import test from "ava";
import * as sinon from "sinon";

import * as apiClient from "../api-client";
import {
  checkExpectedLogMessages,
  getRecordingLogger,
  LoggedMessage,
  setupTests,
} from "../testing-utils";
import { GitHubVariant, initializeEnvironment, withTmpDir } from "../util";

import {
  assertAllFeaturesHaveDefaultValues,
  setUpFeatureFlagTests,
} from "./testing-util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
});

test("OfflineFeatures makes no API requests", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const loggedMessages: LoggedMessage[] = [];
    const logger = getRecordingLogger(loggedMessages);
    const features = setUpFeatureFlagTests(tmpDir, logger, {
      type: GitHubVariant.GHES,
      version: "3.0.0",
    });
    t.is("OfflineFeatures", features.constructor.name);

    sinon
      .stub(apiClient, "getApiClient")
      .throws(new Error("Should not have called getApiClient"));

    await assertAllFeaturesHaveDefaultValues(t, features);
    checkExpectedLogMessages(t, loggedMessages, [
      "Not running against github.com. Using default values for all features.",
    ]);
  });
});
