import { type ExecutionContext } from "ava";

import {
  Feature,
  featureConfig,
  FeatureConfig,
  FeatureEnablement,
  FeatureWithoutCLI,
  initFeatures,
} from "../feature-flags";
import { getRunnerLogger } from "../logging";
import { parseRepositoryNwo } from "../repository";
import {
  LoggedMessage,
  mockCodeQLVersion,
  setupActionsVars,
} from "../testing-utils";
import { ToolsFeature } from "../tools-features";
import { GitHubVariant } from "../util";
import * as util from "../util";

const testRepositoryNwo = parseRepositoryNwo("github/example");

export function assertAllFeaturesUndefinedInApi(
  t: ExecutionContext<unknown>,
  loggedMessages: LoggedMessage[],
) {
  for (const feature of Object.keys(featureConfig)) {
    t.assert(
      loggedMessages.find(
        (v) =>
          v.type === "debug" &&
          (v.message as string).includes(feature) &&
          (v.message as string).includes("undefined in API response"),
      ) !== undefined,
    );
  }
}

export function setUpFeatureFlagTests(
  tmpDir: string,
  logger = getRunnerLogger(true),
  gitHubVersion = { type: GitHubVariant.DOTCOM } as util.GitHubVersion,
): FeatureEnablement {
  setupActionsVars(tmpDir, tmpDir);

  return initFeatures(gitHubVersion, testRepositoryNwo, tmpDir, logger);
}

/**
 * Returns an argument to pass to `getValue` that if required includes a CodeQL object meeting the
 * minimum version or tool feature requirements specified by the feature.
 */
export function getFeatureIncludingCodeQlIfRequired(
  features: FeatureEnablement,
  feature: Feature,
) {
  const config = featureConfig[
    feature
  ] satisfies FeatureConfig as FeatureConfig;
  if (
    config.minimumVersion === undefined &&
    config.toolsFeature === undefined
  ) {
    return features.getValue(feature as FeatureWithoutCLI);
  }

  return features.getValue(
    feature,
    mockCodeQLVersion(
      "9.9.9",
      Object.fromEntries(Object.values(ToolsFeature).map((v) => [v, true])),
    ),
  );
}
