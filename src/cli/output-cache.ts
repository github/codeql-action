import * as fs from "fs";
import * as path from "path";

import { getTemporaryDirectory } from "../actions-util";
import * as json from "../json";
import { getActionsLogger } from "../logging";

/**
 * The name of the temporary file that backs the on-disk cache of
 * CLI responses between workflow steps.
 */
const COMMAND_CACHE_FILENAME = "codeql-action-command-cache.json";

/** A key used to identify cached command output. */
export enum CommandCacheKey {
  Version = "version",
  ResolveLanguages = "resolve languages",
}

export interface VersionInfo {
  version: string;
  features?: { [name: string]: boolean };
  /**
   * The overlay version helps deal with backward incompatible changes for
   * overlay analysis. When a precompiled query pack reports the same overlay
   * version as the CodeQL CLI, we can use the CodeQL CLI to perform overlay
   * analysis with that pack. Otherwise, if the overlay versions are different,
   * or if either the pack or the CLI does not report an overlay version,
   * we need to revert to non-overlay analysis.
   */
  overlayVersion?: number;
}

/** Returns true if `x` is a {@link VersionInfo}. */
export function isVersionInfo(x: unknown): x is VersionInfo {
  return (
    json.isObject(x) &&
    json.validateSchema(
      {
        version: json.string,
        features: {
          validate: (obj): obj is Record<string, boolean> =>
            json.isObject(obj) &&
            Object.values(obj).every((val) => typeof val === "boolean"),
          required: false,
        },
        overlayVersion: json.optional(json.number),
      },
      x,
    )
  );
}

export interface ResolveLanguagesOutput {
  aliases?: {
    [alias: string]: string;
  };
  extractors: {
    [language: string]: Array<{
      extractor_root: string;
      extractor_options?: any;
    }>;
  };
}

/** Returns true if `x` is a {@link ResolveLanguagesOutput}. */
export function isResolveLanguagesOutput(
  x: unknown,
): x is ResolveLanguagesOutput {
  return (
    json.isObject<ResolveLanguagesOutput>(x) &&
    json.isObject(x.extractors) &&
    Object.values(x.extractors).every(
      (extractorList) =>
        json.isArray(extractorList) &&
        extractorList.every(
          (extractor) =>
            json.isObject<{ extractor_root: unknown }>(extractor) &&
            json.isString(extractor.extractor_root),
        ),
    ) &&
    (x.aliases === undefined ||
      (json.isObject(x.aliases) &&
        Object.values(x.aliases).every((alias) => json.isString(alias))))
  );
}

export type CommandCacheKeyOutputMap = {
  [CommandCacheKey.Version]: VersionInfo;
  [CommandCacheKey.ResolveLanguages]: ResolveLanguagesOutput;
};

const commandCacheValidators: {
  [K in CommandCacheKey]: (
    output: unknown,
  ) => output is CommandCacheKeyOutputMap[K];
} = {
  [CommandCacheKey.Version]: isVersionInfo,
  [CommandCacheKey.ResolveLanguages]: isResolveLanguagesOutput,
};

interface StoredCommandCacheEntry {
  cmd: string;
  output: unknown;
}

/** A single cached command output together with the CLI path it came from. */
export interface CommandCacheEntry<K extends CommandCacheKey> {
  /**
   * The path to the CodeQL CLI that produced `output`. Persisted so that a
   * different step using a different CodeQL bundle doesn't pick up a stale
   * value.
   */
  cmd: string;
  output: CommandCacheKeyOutputMap[K];
}

/**
 * Tier 1: the in-process memo. Consulted first on every lookup and populated
 * whenever a value is read from the file (tier 2) or computed via the CLI
 * (tier 3).
 */
const inMemoryCache = new Map<
  CommandCacheKey,
  CommandCacheEntry<CommandCacheKey>
>();
const logger = getActionsLogger();

function getCommandCacheFilePath(): string {
  return path.join(getTemporaryDirectory(), COMMAND_CACHE_FILENAME);
}

/**
 * Reads and parses the temporary cache file. Best-effort: a missing, malformed,
 * or otherwise unreadable file is treated as an empty cache.
 */
function readCommandCacheFile(): Record<string, StoredCommandCacheEntry> {
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
 * Persists the in-memory cache to the temporary file. Best-effort: a failure to write
 * just means a later step re-runs the CLI.
 */
export function writeCommandCacheFile(): void {
  try {
    fs.writeFileSync(
      getCommandCacheFilePath(),
      JSON.stringify(Object.fromEntries(inMemoryCache)),
    );
  } catch (e) {
    logger.warning(`Failed to write command cache file: ${e}`);
  }
}

/**
 * Stores the output of a CLI command under `key` in a module-global object.
 */
export function cacheCommandOutput<K extends CommandCacheKey>(
  key: K,
  cmd: string,
  output: CommandCacheKeyOutputMap[K],
): void {
  const entry: CommandCacheEntry<K> = { cmd, output };
  inMemoryCache.set(key, entry);
}

/**
 * Returns the cached output for `key`, or `undefined` if it isn't cached.
 *
 * Resolves tier 1 (in-memory memo) first, then tier 2 (temporary file). A value
 * loaded from the file is ignored unless its `cmd` matches the optional `cmd`
 * argument and its output satisfies the internal validator for `key`; valid
 * values are memoized into tier 1 before being returned.
 *
 * A return value of `undefined` signals the caller to fall back to tier 3 (the
 * CLI).
 */
export function getCachedCommandOutput<K extends CommandCacheKey>(
  key: K,
  cmd?: string,
): CommandCacheKeyOutputMap[K] | undefined {
  // Tier 1: the in-memory variable.
  const memoized = inMemoryCache.get(key);
  if (memoized !== undefined) {
    return memoized.output as CommandCacheKeyOutputMap[K];
  }

  // Tier 2: the temporary file persisted by an earlier step, if any.
  const entry = readCommandCacheFile()[key] as unknown;
  if (
    !json.isObject<StoredCommandCacheEntry>(entry) ||
    !json.isString(entry.cmd) ||
    (cmd !== undefined && entry.cmd !== cmd) ||
    !commandCacheValidators[key](entry.output)
  ) {
    logger.warning("Received invalid data from the command-cache file.");
    return undefined;
  }

  // Memoize so subsequent lookups in this process hit tier 1.
  const cachedEntry = entry as StoredCommandCacheEntry;
  const output = cachedEntry.output as CommandCacheKeyOutputMap[K];
  cacheCommandOutput(key, cachedEntry.cmd, output);
  return output;
}

/**
 * Clears the in-process memo (tier 1). Only for use in tests, which exercise
 * multiple "steps" within a single process.
 */
export function resetCachedCommandOutputs(): void {
  inMemoryCache.clear();
}
