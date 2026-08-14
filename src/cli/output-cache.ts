import * as fs from "fs";
import path from "path";

import { getTemporaryDirectory } from "../actions-util";
import { Env } from "../environment";
import * as json from "../json";
import { Logger } from "../logging";

import { VersionInfo, versionInfoBaseSchema } from "./types";

/**
 * The keys of the command cache. Each key corresponds to a command whose output we cache.
 */
export type CommandCacheKey = string;

/**
 * The JSON schema of the command cache that is persisted to disk.
 */
const outputCacheSchema = {
  cmd: json.string,
  entries: json.object({}),
} as const satisfies json.Schema;

/**
 * The type that describes the command cache that is persisted to disk.
 */
export type OutputCache = json.FromSchema<typeof outputCacheSchema> & {
  entries: { version: VersionInfo };
};

/**
 * The name of the temporary file that backs the on-disk cache of
 * CLI responses between workflow steps.
 */
const COMMAND_CACHE_FILENAME = "codeql-action-command-cache.json";

/**
 * The module-global variable that caches the CodeQL CLI version in-memory.
 */
let cachedCodeQlVersion: undefined | VersionInfo = undefined;

/**
 * Resets the in-process cache of the CodeQL CLI version. Only for use in tests,
 * which exercise multiple "steps" within a single process.
 */
export function resetCachedCodeQlVersion(): void {
  cachedCodeQlVersion = undefined;
}

/**
 * Returns the path to the temporary file that backs the
 * on-disk cache of CLI responses between workflow steps.
 */
export function getCommandCacheFilePath(env: Env): string {
  return path.join(getTemporaryDirectory(env), COMMAND_CACHE_FILENAME);
}

/**
 * Caches the CodeQL CLI version both in-memory and on disk.
 * @param cacheFilePath The path to the cache file.
 * @param cmd The path to the CodeQL CLI.
 * @param version The version information to cache.
 */
export function cacheCodeQlVersion(
  cacheFilePath: string,
  cmd: string,
  version: VersionInfo,
): void {
  if (cachedCodeQlVersion !== undefined) {
    throw new Error("cacheCodeQlVersion() should be called only once");
  }
  cachedCodeQlVersion = version;
  const outputCache = {
    cmd,
    entries: { version },
  } satisfies OutputCache;
  // Persist the version so that subsequent Actions steps, which run in separate
  // processes, can reuse it rather than invoking `codeql version` again. We
  // record the CLI path so that a different step using a different CodeQL bundle
  // doesn't pick up a stale version.
  fs.writeFileSync(cacheFilePath, JSON.stringify(outputCache), "utf8");
}

/**
 * Returns the cached CodeQL CLI version, if any.
 * @param logger The logger to use for logging messages.
 * @param cacheFilePath The path to the cache file.
 * @param cmd The path to the CodeQL CLI.
 */
export function getCachedCodeQlVersion(
  logger: Logger,
  cacheFilePath: string,
  cmd?: string,
): undefined | VersionInfo {
  if (cachedCodeQlVersion !== undefined) {
    return cachedCodeQlVersion;
  }
  // Fall back to the value persisted by an earlier Actions step, if any. This is
  // best-effort: any malformed or mismatched value is ignored so that the caller
  // invokes `codeql version` instead.
  let serialized: string;
  try {
    serialized = fs.readFileSync(cacheFilePath, "utf8");
  } catch (e) {
    logger.debug(`Cannot read CLI-cache file ${cacheFilePath}: ${e}`);
    return undefined;
  }
  let persisted: unknown;
  try {
    persisted = JSON.parse(serialized);
  } catch (e) {
    logger.debug(`Cannot parse CLI-cache data as JSON: ${e}`);
    return undefined;
  }
  if (
    !isOutputCache(persisted) ||
    (cmd !== undefined && persisted.cmd !== cmd)
  ) {
    return undefined;
  }
  // Memoize the parsed value so that subsequent calls in this process don't
  // re-parse the environment variable.
  cachedCodeQlVersion = persisted.entries.version as VersionInfo;
  return cachedCodeQlVersion;
}

/**
 * Determines whether a value is a `VersionInfo` object.
 * @param x The value to test
 */
function isVersionInfo(x: unknown): x is VersionInfo {
  return json.isObject(x) && json.validateSchema(versionInfoBaseSchema, x);
}

/**
 * Determines whether a value is a `OutputCache` object.
 * @param x The value to test
 */
function isOutputCache(x: unknown): x is OutputCache {
  return (
    json.isObject(x) &&
    json.validateSchema(outputCacheSchema, x) &&
    json.isObject<{ version: unknown }>(x.entries) &&
    isVersionInfo(x.entries.version)
  );
}
