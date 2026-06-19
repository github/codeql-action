import * as fs from "fs";
import * as path from "path";

import { getTemporaryDirectory } from "./actions-util";
import * as json from "./json";
import { getActionsLogger } from "./logging";

/**
 * The name of the temporary file that backs the on-disk cache of
 * CLI responses between workflow steps.
 */
const COMMAND_CACHE_FILENAME = "codeql-action-command-cache.json";

/** Named keys for the CLI command-output cache. */
export const CommandCacheKey = {
  Version: "version",
  ResolveLanguages: "resolveLanguages",
} as const;

/** A key used to identify cached command output. */
export type CommandCacheKey =
  (typeof CommandCacheKey)[keyof typeof CommandCacheKey];

/** A single cached command output together with the CLI path it came from. */
interface CommandCacheEntry {
  /**
   * The path to the CodeQL CLI that produced `output`. Persisted so that a
   * different step using a different CodeQL bundle doesn't pick up a stale
   * value.
   */
  cmd: string;
  output: unknown;
}

/**
 * Tier 1: the in-process memo. Consulted first on every lookup and populated
 * whenever a value is read from the file (tier 2) or computed via the CLI
 * (tier 3).
 */
const inMemoryCache = new Map<CommandCacheKey, CommandCacheEntry>();
const logger = getActionsLogger();

function getCommandCacheFilePath(): string {
  return path.join(getTemporaryDirectory(), COMMAND_CACHE_FILENAME);
}

/**
 * Reads and parses the temporary cache file. Best-effort: a missing, malformed,
 * or otherwise unreadable file is treated as an empty cache.
 */
function readCommandCacheFile(): Record<string, CommandCacheEntry> {
  if (!fs.existsSync(getCommandCacheFilePath())) {
    return {};
  }
  try {
    const contents = fs.readFileSync(getCommandCacheFilePath(), "utf8");
    const parsed = json.parseString(contents);
    if (json.isObject(parsed)) {
      return parsed;
    }
  } catch (e) {
    logger.warning(`Failed to read or parse command cache file: ${e}`);
  }
  return {};
}

/**
 * Persists the cache to the temporary file. Best-effort: a failure to write
 * just means a later step re-runs the CLI.
 */
function writeCommandCacheFile(data: Record<string, CommandCacheEntry>): void {
  try {
    fs.writeFileSync(getCommandCacheFilePath(), JSON.stringify(data));
  } catch (e) {
    logger.warning(`Failed to write command cache file: ${e}`);
  }
}

/**
 * Stores the output of a command under `key`, writing it to both the in-memory
 * memo (tier 1) and the temporary file (tier 2).
 *
 * Should only be called once per key within a single process; doing otherwise
 * indicates a logic error, since a value that has already been cached should be
 * served from the memo rather than recomputed.
 */
export function cacheCommandOutput(
  key: CommandCacheKey,
  cmd: string,
  output: unknown,
): void {
  if (inMemoryCache.has(key)) {
    throw new Error(
      `cacheCommandOutput() should be called only once per key, but was called more than once for '${key}'.`,
    );
  }
  const entry: CommandCacheEntry = { cmd, output };
  inMemoryCache.set(key, entry);

  const data = readCommandCacheFile();
  data[key] = entry;
  writeCommandCacheFile(data);
}

/**
 * Returns the cached output for `key`, or `undefined` if it isn't cached.
 *
 * Resolves tier 1 (in-memory memo) first, then tier 2 (temporary file). A value
 * loaded from the file is ignored unless its `cmd` matches the optional `cmd`
 * argument, and it satisfies the optional `validate` type guard; valid values
 * are memoized into tier 1 before being returned.
 *
 * A return value of `undefined` signals the caller to fall back to tier 3 (the
 * CLI).
 */
export function getCachedCommandOutput<T>(
  key: CommandCacheKey,
  cmd?: string,
  validate?: (output: unknown) => output is T,
): T | undefined {
  // Tier 1: the in-memory variable.
  const memoized = inMemoryCache.get(key);
  if (memoized !== undefined) {
    return memoized.output as T;
  }

  // Tier 2: the temporary file persisted by an earlier step, if any.
  const entry = readCommandCacheFile()[key] as unknown;
  if (
    !json.isObject<CommandCacheEntry>(entry) ||
    !json.isString(entry.cmd) ||
    (cmd !== undefined && entry.cmd !== cmd) ||
    (validate !== undefined && !validate(entry.output))
  ) {
    return undefined;
  }

  // Memoize so subsequent lookups in this process hit tier 1.
  inMemoryCache.set(key, { cmd: entry.cmd, output: entry.output });
  return entry.output as T;
}

/**
 * Clears the in-process memo (tier 1). Only for use in tests, which exercise
 * multiple "steps" within a single process.
 */
export function resetCachedCommandOutputs(): void {
  inMemoryCache.clear();
}
