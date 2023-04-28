import * as fs from "fs";
import * as path from "path";

import * as configUtils from "./config-utils";
import { isTracedLanguage } from "./languages";

export type TracerConfig = {
  env: { [key: string]: string };
};

export async function endTracingForCluster(
  config: configUtils.Config
): Promise<void> {
  // If there are no traced languages, we don't need to do anything.
  if (!config.languages.some((l) => isTracedLanguage(l))) return;

  const envVariablesFile = path.resolve(
    config.dbLocation,
    "temp/tracingEnvironment/end-tracing.json"
  );
  if (!fs.existsSync(envVariablesFile)) {
    throw new Error(
      `Environment file for ending tracing not found: ${envVariablesFile}`
    );
  }
  try {
    const endTracingEnvVariables: Map<string, string | null> = JSON.parse(
      fs.readFileSync(envVariablesFile, "utf8")
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
      `Failed to parse file containing end tracing environment variables: ${e}`
    );
  }
}

export async function getTracerConfigForCluster(
  config: configUtils.Config
): Promise<TracerConfig> {
  const tracingEnvVariables = JSON.parse(
    fs.readFileSync(
      path.resolve(
        config.dbLocation,
        "temp/tracingEnvironment/start-tracing.json"
      ),
      "utf8"
    )
  );
  return {
    env: tracingEnvVariables,
  };
}

export async function getCombinedTracerConfig(
  config: configUtils.Config
): Promise<TracerConfig | undefined> {
  // Abort if there are no traced languages as there's nothing to do
  const tracedLanguages = config.languages.filter((l) => isTracedLanguage(l));
  if (tracedLanguages.length === 0) {
    return undefined;
  }

  const mainTracerConfig = await getTracerConfigForCluster(config);

  // On macos it's necessary to prefix the build command with the runner executable
  // on order to trace when System Integrity Protection is enabled.
  // The executable also exists and works for other platforms so we output this env
  // var with a path to the runner regardless so it's always available.
  const runnerExeName = process.platform === "win32" ? "runner.exe" : "runner";
  mainTracerConfig.env["CODEQL_RUNNER"] = path.join(
    mainTracerConfig.env["CODEQL_DIST"],
    "tools",
    mainTracerConfig.env["CODEQL_PLATFORM"],
    runnerExeName
  );

  return mainTracerConfig;
}
