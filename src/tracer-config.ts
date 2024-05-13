import * as fs from "fs";
import * as path from "path";

import { type CodeQL } from "./codeql";
import { type Config } from "./config-utils";
import { Feature, FeatureEnablement } from "./feature-flags";
import { isTracedLanguage } from "./languages";
import { Logger } from "./logging";
import { ToolsFeature } from "./tools-features";
import { BuildMode } from "./util";

export type TracerConfig = {
  env: { [key: string]: string };
};

export async function shouldEnableIndirectTracing(
  codeql: CodeQL,
  config: Config,
  features: FeatureEnablement,
): Promise<boolean> {
  return (
    (!config.buildMode ||
      config.buildMode === BuildMode.Manual ||
      !(await features.getValue(Feature.AutobuildDirectTracing, codeql))) &&
    config.languages.some((l) => isTracedLanguage(l))
  );
}

/**
 * Delete variables as specified by the end-tracing script
 *
 * WARNING: This does not _really_ end tracing, as the tracer will restore its
 * critical environment variables and it'll still be active for all processes
 * launched from this build step.
 *
 * However, it will stop tracing for all steps past the current build step.
 */
export async function endTracingForCluster(
  codeql: CodeQL,
  config: Config,
  logger: Logger,
  features: FeatureEnablement,
): Promise<void> {
  if (!(await shouldEnableIndirectTracing(codeql, config, features))) return;

  logger.info(
    "Unsetting build tracing environment variables. Subsequent steps of this job will not be traced.",
  );

  const envVariablesFile = path.resolve(
    config.dbLocation,
    "temp/tracingEnvironment/end-tracing.json",
  );
  if (!fs.existsSync(envVariablesFile)) {
    throw new Error(
      `Environment file for ending tracing not found: ${envVariablesFile}`,
    );
  }
  try {
    const endTracingEnvVariables: Map<string, string | null> = JSON.parse(
      fs.readFileSync(envVariablesFile, "utf8"),
    );
    for (const [key, value] of Object.entries(endTracingEnvVariables)) {
      if (value !== null) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  } catch (e) {
    throw new Error(
      `Failed to parse file containing end tracing environment variables: ${e}`,
    );
  }
}

export async function getTracerConfigForCluster(
  config: Config,
): Promise<TracerConfig> {
  const tracingEnvVariables = JSON.parse(
    fs.readFileSync(
      path.resolve(
        config.dbLocation,
        "temp/tracingEnvironment/start-tracing.json",
      ),
      "utf8",
    ),
  );
  return {
    env: tracingEnvVariables,
  };
}

export async function getCombinedTracerConfig(
  codeql: CodeQL,
  config: Config,
  features: FeatureEnablement,
): Promise<TracerConfig | undefined> {
  if (!(await shouldEnableIndirectTracing(codeql, config, features)))
    return undefined;

  const mainTracerConfig = await getTracerConfigForCluster(config);

  // If the CLI doesn't yet support setting the CODEQL_RUNNER environment variable to
  // the runner executable path, we set it here in the Action.
  if (!(await codeql.supportsFeature(ToolsFeature.SetsCodeqlRunnerEnvVar))) {
    // On MacOS when System Integrity Protection is enabled, it's necessary to prefix
    // the build command with the runner executable for indirect tracing, so we expose
    // it here via the CODEQL_RUNNER environment variable.
    // The executable also exists and works for other platforms so we unconditionally
    // set the environment variable.
    const runnerExeName =
      process.platform === "win32" ? "runner.exe" : "runner";
    mainTracerConfig.env["CODEQL_RUNNER"] = path.join(
      mainTracerConfig.env["CODEQL_DIST"],
      "tools",
      mainTracerConfig.env["CODEQL_PLATFORM"],
      runnerExeName,
    );
  }

  return mainTracerConfig;
}
