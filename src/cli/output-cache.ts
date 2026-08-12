import * as fs from "fs";
import path from "path";

import { getTemporaryDirectory } from "../actions-util";
import { Env } from "../environment";

import type { VersionInfo } from "./types";

/**
 * The keys of the command cache. Each key corresponds to a command whose output we cache.
 */
export enum CommandCacheKey {
  Version = "version",
}

/**
 * The mapping of CLI commands to the types of the output of each command that we cache.
 */
export type CommandCacheKeyOutputMap = {
  [CommandCacheKey.Version]: VersionInfo;
};

/**
 * The type of the command cache that is persisted to disk.
 */
export interface OutputCache<K extends CommandCacheKey> {
  cmd: string;
  entries: Map<K, CommandCacheKeyOutputMap[K]>;
}

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
function getCommandCacheFilePath(env: Env): string {
  return path.join(getTemporaryDirectory(env), COMMAND_CACHE_FILENAME);
}

/**
 * Caches the CodeQL CLI version both in-memory and on disk.
 * @param cmd The path to the CodeQL CLI.
 * @param version The version information to cache.
 * @param env The environment variables to use.
 */
export function cacheCodeQlVersion(
  cmd: string,
  version: VersionInfo,
  env: Env,
): void {
  if (cachedCodeQlVersion !== undefined) {
    throw new Error("cacheCodeQlVersion() should be called only once");
  }
  cachedCodeQlVersion = version;
  // Persist the version so that subsequent Actions steps, which run in separate
  // processes, can reuse it rather than invoking `codeql version` again. We
  // record the CLI path so that a different step using a different CodeQL bundle
  // doesn't pick up a stale version.
  fs.writeFileSync(
    getCommandCacheFilePath(env),
    JSON.stringify({ cmd, entries: { [CommandCacheKey.Version]: version } }),
    "utf8",
  );
}

/**
 * Returns the cached CodeQL CLI version, if any.
 * @param env The environment variables to use.
 * @param cmd The path to the CodeQL CLI.
 */
export function getCachedCodeQlVersion(
  env: Env,
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
    serialized = fs.readFileSync(getCommandCacheFilePath(env), "utf8");
  } catch {
    return undefined;
  }
  let persisted: unknown;
  try {
    persisted = JSON.parse(serialized);
  } catch {
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
  cachedCodeQlVersion = persisted.entries[CommandCacheKey.Version];
  return cachedCodeQlVersion;
}

/**
 * Determines whether a value is a `VersionInfo` object.
 * @param x The value to test
 */
function isVersionInfo(x: unknown): x is VersionInfo {
  const candidate = x as Partial<VersionInfo> | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.version === "string" &&
    (candidate.features === undefined ||
      (typeof candidate.features === "object" &&
        candidate.features !== null)) &&
    (candidate.overlayVersion === undefined ||
      typeof candidate.overlayVersion === "number")
  );
}

/**
 * Determines whether a value is a `OutputCache` object.
 * @param x The value to test
 */
function isOutputCache(x: unknown): x is OutputCache<CommandCacheKey.Version> {
  const candidate = x as Partial<OutputCache<CommandCacheKey.Version>> | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.cmd === "string" &&
    candidate.entries !== undefined &&
    isVersionInfo(candidate.entries[CommandCacheKey.Version])
  );
}
