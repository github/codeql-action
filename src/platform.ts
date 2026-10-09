import * as semver from "semver";

import type { ActionState } from "./action-common";

/** Platform identifiers used in CodeQL bundle asset names. */
export enum BundlePlatform {
  Linux64 = "linux64",
  LinuxArm64 = "linux-arm64",
  Osx64 = "osx64",
  Win64 = "win64",
}

/** Returns the bundle platform, or undefined when an all-platform bundle is required. */
export function getBundlePlatform(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): BundlePlatform | undefined {
  switch (platform) {
    case "win32":
      return BundlePlatform.Win64;
    case "linux":
      return arch === "arm64"
        ? BundlePlatform.LinuxArm64
        : BundlePlatform.Linux64;
    case "darwin":
      return BundlePlatform.Osx64;
    default:
      return undefined;
  }
}

/**
 * Tries to determine the version of macOS.
 *
 * @returns
 *  The version as either a semantic version object, the raw version string
 *  if it is not a semantic version, or `undefined` if we are not on macOS.
 */
export function macOSVersion(
  action: ActionState<["Base"]>,
): semver.SemVer | string | undefined {
  // Skip if we are not running on macOS.
  if (action.platform !== "darwin") {
    return undefined;
  }

  // Try to parse the OS version string.
  const version = semver.parse(action.osRelease);

  if (version === null) {
    return action.osRelease;
  }

  return version;
}
