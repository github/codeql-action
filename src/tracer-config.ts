import * as fs from "fs";
import * as path from "path";

import { CodeQL, CODEQL_VERSION_NEW_TRACING } from "./codeql";
import * as configUtils from "./config-utils";
import { Language, isTracedLanguage } from "./languages";
import * as util from "./util";
import { codeQlVersionAbove } from "./util";

export type TracerConfig = {
  spec: string;
  env: { [key: string]: string };
};

const CRITICAL_TRACER_VARS = new Set([
  "SEMMLE_PRELOAD_libtrace",
  "SEMMLE_RUNNER",
  "SEMMLE_COPY_EXECUTABLES_ROOT",
  "SEMMLE_DEPTRACE_SOCKET",
  "SEMMLE_JAVA_TOOL_OPTIONS",
]);

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
    spec: tracingEnvVariables["ODASA_TRACER_CONFIGURATION"],
    env: tracingEnvVariables,
  };
}

export async function getTracerConfigForLanguage(
  codeql: CodeQL,
  config: configUtils.Config,
  language: Language
): Promise<TracerConfig> {
  const env = await codeql.getTracerEnv(
    util.getCodeQLDatabasePath(config, language)
  );

  const spec = env["ODASA_TRACER_CONFIGURATION"];
  const info: TracerConfig = { spec, env: {} };

  // Extract critical tracer variables from the environment
  for (const entry of Object.entries(env)) {
    const key = entry[0];
    const value = entry[1];
    // skip ODASA_TRACER_CONFIGURATION as it is handled separately
    if (key === "ODASA_TRACER_CONFIGURATION") {
      continue;
    }
    // skip undefined values
    if (typeof value === "undefined") {
      continue;
    }
    // Keep variables that do not exist in current environment. In addition always keep
    // critical and CODEQL_ variables
    if (
      typeof process.env[key] === "undefined" ||
      CRITICAL_TRACER_VARS.has(key) ||
      key.startsWith("CODEQL_")
    ) {
      info.env[key] = value;
    }
  }
  return info;
}

export function concatTracerConfigs(
  tracerConfigs: { [lang: string]: TracerConfig },
  config: configUtils.Config,
  writeBothEnvironments = false
): TracerConfig {
  // A tracer config is a map containing additional environment variables and a tracer 'spec' file.
  // A tracer 'spec' file has the following format [log_file, number_of_blocks, blocks_text]

  // Merge the environments
  const env: { [key: string]: string } = {};
  let copyExecutables = false;
  let envSize = 0;
  for (const v of Object.values(tracerConfigs)) {
    for (const e of Object.entries(v.env)) {
      const name = e[0];
      const value = e[1];
      // skip SEMMLE_COPY_EXECUTABLES_ROOT as it is handled separately
      if (name === "SEMMLE_COPY_EXECUTABLES_ROOT") {
        copyExecutables = true;
      } else if (name in env) {
        if (env[name] !== value) {
          throw Error(
            `Incompatible values in environment parameter ${name}: ${env[name]} and ${value}`
          );
        }
      } else {
        env[name] = value;
        envSize += 1;
      }
    }
  }

  // Concatenate spec files into a new spec file
  const languages = Object.keys(tracerConfigs);
  const cppIndex = languages.indexOf("cpp");
  // Make sure cpp is the last language, if it's present since it must be concatenated last
  if (cppIndex !== -1) {
    const lastLang = languages[languages.length - 1];
    languages[languages.length - 1] = languages[cppIndex];
    languages[cppIndex] = lastLang;
  }

  const totalLines: string[] = [];
  let totalCount = 0;
  for (const lang of languages) {
    const lines = fs
      .readFileSync(tracerConfigs[lang].spec, "utf8")
      .split(/\r?\n/);
    const count = parseInt(lines[1], 10);
    totalCount += count;
    totalLines.push(...lines.slice(2));
  }

  const newLogFilePath = path.resolve(
    config.tempDir,
    "compound-build-tracer.log"
  );
  const spec = path.resolve(config.tempDir, "compound-spec");
  const compoundTempFolder = path.resolve(config.tempDir, "compound-temp");
  const newSpecContent = [
    newLogFilePath,
    totalCount.toString(10),
    ...totalLines,
  ];

  if (copyExecutables) {
    env["SEMMLE_COPY_EXECUTABLES_ROOT"] = compoundTempFolder;
    envSize += 1;
  }

  fs.writeFileSync(spec, newSpecContent.join("\n"));

  if (writeBothEnvironments || process.platform !== "win32") {
    // Prepare the content of the compound environment file on Unix
    let buffer = Buffer.alloc(4);
    buffer.writeInt32LE(envSize, 0);
    for (const e of Object.entries(env)) {
      const key = e[0];
      const value = e[1];
      const lineBuffer = Buffer.from(`${key}=${value}\0`, "utf8");
      const sizeBuffer = Buffer.alloc(4);
      sizeBuffer.writeInt32LE(lineBuffer.length, 0);
      buffer = Buffer.concat([buffer, sizeBuffer, lineBuffer]);
    }
    // Write the compound environment for Unix
    const envPath = `${spec}.environment`;
    fs.writeFileSync(envPath, buffer);
  }

  if (writeBothEnvironments || process.platform === "win32") {
    // Prepare the content of the compound environment file on Windows
    let bufferWindows = Buffer.alloc(0);
    let length = 0;
    for (const e of Object.entries(env)) {
      const key = e[0];
      const value = e[1];
      const string = `${key}=${value}\0`;
      length += string.length;
      const lineBuffer = Buffer.from(string, "utf16le");
      bufferWindows = Buffer.concat([bufferWindows, lineBuffer]);
    }
    const sizeBuffer = Buffer.alloc(4);
    sizeBuffer.writeInt32LE(length + 1, 0); // Add one for trailing null character marking end
    const trailingNull = Buffer.from(`\0`, "utf16le");
    bufferWindows = Buffer.concat([sizeBuffer, bufferWindows, trailingNull]);
    // Write the compound environment for Windows
    const envPathWindows = `${spec}.win32env`;
    fs.writeFileSync(envPathWindows, bufferWindows);
  }

  return { env, spec };
}

export async function getCombinedTracerConfig(
  config: configUtils.Config,
  codeql: CodeQL
): Promise<TracerConfig | undefined> {
  // Abort if there are no traced languages as there's nothing to do
  const tracedLanguages = config.languages.filter(isTracedLanguage);
  if (tracedLanguages.length === 0) {
    return undefined;
  }

  let mainTracerConfig: TracerConfig;
  if (await codeQlVersionAbove(codeql, CODEQL_VERSION_NEW_TRACING)) {
    mainTracerConfig = await getTracerConfigForCluster(config);
  } else {
    // Get all the tracer configs and combine them together
    const tracedLanguageConfigs: { [lang: string]: TracerConfig } = {};
    for (const language of tracedLanguages) {
      tracedLanguageConfigs[language] = await getTracerConfigForLanguage(
        codeql,
        config,
        language
      );
    }
    mainTracerConfig = concatTracerConfigs(tracedLanguageConfigs, config);
  }

  // Add a couple more variables
  mainTracerConfig.env["ODASA_TRACER_CONFIGURATION"] = mainTracerConfig.spec;
  const codeQLDir = path.dirname(codeql.getPath());
  if (process.platform === "darwin") {
    mainTracerConfig.env["DYLD_INSERT_LIBRARIES"] = path.join(
      codeQLDir,
      "tools",
      "osx64",
      "libtrace.dylib"
    );
  } else if (process.platform !== "win32") {
    mainTracerConfig.env["LD_PRELOAD"] = path.join(
      codeQLDir,
      "tools",
      "linux64",
      "${LIB}trace.so"
    );
  }

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
