import test from "ava";
import * as sinon from "sinon";

import * as apiClient from "../api-client";
import { Feature, featureConfig } from "../feature-flags";
import { mockCCR, setupTests } from "../testing-utils";
import { initializeEnvironment, withTmpDir } from "../util";

import {
  getFeatureIncludingCodeQlIfRequired,
  setUpFeatureFlagTests,
} from "./testing-util";

setupTests(test);

test.beforeEach(() => {
  initializeEnvironment("1.2.3");
  mockCCR();
});

test("OfflineFeatures makes no API requests", async (t) => {
  await withTmpDir(async (tmpDir) => {
    const features = setUpFeatureFlagTests(tmpDir);
    t.is("OfflineFeatures", features.constructor.name);

    sinon
      .stub(apiClient, "getApiClient")
      .throws(new Error("Should not have called getApiClient"));

    for (const feature of Object.values(Feature)) {
      t.deepEqual(
        await getFeatureIncludingCodeQlIfRequired(features, feature),
        featureConfig[feature].defaultValue,
      );
    }
  });
});
