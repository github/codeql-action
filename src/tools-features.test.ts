import test from "ava";

import { makeVersionInfo } from "./testing-utils";
import { ToolsFeature, isSupportedToolsFeature } from "./tools-features";

test("isSupportedToolsFeature", async (t) => {
  const versionInfo = makeVersionInfo("1.0.0");

  t.false(isSupportedToolsFeature(versionInfo, ToolsFeature.ForceOverwrite));

  versionInfo.features = { forceOverwrite: true };

  t.true(isSupportedToolsFeature(versionInfo, ToolsFeature.ForceOverwrite));
});
