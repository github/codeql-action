import * as core from "@actions/core";

import { getOptionalInput, isDefaultSetup } from "./actions-util";
import { EnvVar } from "./environment";
import { Logger } from "./logging";
import { isHostedRunner, tryGetFolderBytes } from "./util";

/**
 * Returns the total size of all the specified paths.
 * @param paths The paths for which to calculate the total size.
 * @param logger A logger to record some informational messages to.
 * @param quiet A value indicating whether to suppress logging warnings (default: false).
 * @returns The total size of all specified paths.
 */
export async function getTotalCacheSize(
  paths: string[],
  logger: Logger,
  quiet: boolean = false,
): Promise<number> {
  const sizes = await Promise.all(
    paths.map((cacheDir) => tryGetFolderBytes(cacheDir, logger, quiet)),
  );
  return sizes.map((a) => a || 0).reduce((a, b) => a + b, 0);
}

/* Enumerates caching modes. */
export enum CachingKind {
  /** Do not restore or store any caches. */
  None = "none",
  /** Store caches, but do not restore any existing ones. */
  Store = "store",
  /** Restore existing caches, but do not store any new ones. */
  Restore = "restore",
  /** Restore existing caches, and store new ones. */
  Full = "full",
}

/** Returns a value indicating whether new caches should be stored, based on `kind`. */
export function shouldStoreCache(kind: CachingKind): boolean {
  return kind === CachingKind.Full || kind === CachingKind.Store;
}

/** Returns a value indicating whether existing caches should be restored, based on `kind`. */
export function shouldRestoreCache(kind: CachingKind): boolean {
  return kind === CachingKind.Full || kind === CachingKind.Restore;
}

/**
 * Parses the `upload` input into an `UploadKind`.
 */
export function getCachingKind(input: string | undefined): CachingKind {
  switch (input) {
    case undefined:
    case "none":
    case "off":
    case "false":
      return CachingKind.None;
    case "full":
    case "on":
    case "true":
      return CachingKind.Full;
    case "store":
      return CachingKind.Store;
    case "restore":
      return CachingKind.Restore;
    default:
      core.warning(
        `Unrecognized 'dependency-caching' input: ${input}. Defaulting to 'none'.`,
      );
      return CachingKind.None;
  }
}

/** Determines whether dependency caching is enabled. */
export function getDependencyCachingEnabled(): CachingKind {
  // If the workflow specified something always respect that
  const dependencyCaching =
    getOptionalInput("dependency-caching") ||
    process.env[EnvVar.DEPENDENCY_CACHING];
  if (dependencyCaching !== undefined) return getCachingKind(dependencyCaching);

  // On self-hosted runners which may have dependencies installed centrally, disable caching by default
  if (!isHostedRunner()) return CachingKind.None;

  // Disable in advanced workflows by default.
  if (!isDefaultSetup()) return CachingKind.None;

  // On hosted runners, disable dependency caching by default.
  // TODO: Review later whether we can enable this by default.
  return CachingKind.None;
}
