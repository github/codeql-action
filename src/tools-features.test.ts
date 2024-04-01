import test from "ava";

import { makeVersionInfo } from "./testing-utils";
import { ToolsFeature, isSupportedToolsFeature } from "./tools-features";

test("isSupportedToolsFeature", async (t) => {
  const versionInfo = makeVersionInfo("1.0.0");

  t.false(
    isSupportedToolsFeature(
      versionInfo,
      ToolsFeature.IndirectTracingSupportsStaticBinaries,
    ),
  );

  versionInfo.features = { indirectTracingSupportsStaticBinaries: true };

  t.true(
    isSupportedToolsFeature(
      versionInfo,
      ToolsFeature.IndirectTracingSupportsStaticBinaries,
    ),
  );
});

test("setsCodeqlRunnerEnvVar", async (t) => {
  const versionInfo = makeVersionInfo("1.0.0");

  t.false(
    isSupportedToolsFeature(versionInfo, ToolsFeature.SetsCodeqlRunnerEnvVar),
  );

  versionInfo.features = { setsCodeqlRunnerEnvVar: true };

  t.true(
    isSupportedToolsFeature(versionInfo, ToolsFeature.SetsCodeqlRunnerEnvVar),
  );
});
