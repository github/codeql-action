import * as fs from "fs";
import * as path from "path";

import { type CodeQL } from "./codeql";
import { type Config } from "./config-utils";
import { Logger } from "./logging";
import { asyncSome, BuildMode } from "./util";

export type TracerConfig = {
  env: { [key: string]: string };
};

export async function shouldEnableIndirectTracing(
  codeql: CodeQL,
  config: Config,
): Promise<boolean> {
  // We don't need to trace build mode none, or languages which unconditionally don't need tracing.
  if (config.buildMode === BuildMode.None) {
    return false;
  }

  // If the CLI supports `trace-command` with a `--build-mode`, we'll use direct tracing instead of
  // indirect tracing.
  if (config.buildMode === BuildMode.Autobuild) {
    return false;
  }

  // Otherwise, use direct tracing if any of the languages need to be traced.
  return asyncSome(config.languages, (l) => codeql.isTracedLanguage(l));
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
): Promise<void> {
  if (!(await shouldEnableIndirectTracing(codeql, config))) return;

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
): Promise<TracerConfig | undefined> {
  if (!(await shouldEnableIndirectTracing(codeql, config))) {
    return undefined;
  }

  return await getTracerConfigForCluster(config);
}
