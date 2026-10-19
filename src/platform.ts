import fs from "fs";

import * as semver from "semver";

import type { ActionState, Logger } from "./action-common";
import { getErrorMessage } from "./util";

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

/** The static path we check for a symbolic link to the (dynamic) Xcode location. */
export const XCODE_SELECT_LINK_PATH = "/private/var/db/xcode_select_link";

/** The pattern we expect to find in the Xcode path. */
export const XCODE_APP_FILENAME_PATTERN = new RegExp(
  /(?<filename>Xcode_(?<majorMinor>\d+(\.\d+)?)\.app)/,
);

/**
 * Tries to determine the version of Xcode that is installed.
 *
 * @param logger The logger to use.
 * @returns The Xcode version or `undefined` if it couldn't be determined.
 */
export function xcodeVersion(logger: Logger): semver.SemVer | undefined {
  try {
    // Stat the expected symbolic link to check that it exists and is a symbolic link.
    // The `readlinkSync` call below returns an empty string in either case and so
    // this check allows us to distinguish between the two cases.
    const stats = fs.statSync(XCODE_SELECT_LINK_PATH);

    if (!stats.isSymbolicLink()) {
      logger.warning(
        `${XCODE_SELECT_LINK_PATH} exists, but is not a symbolic link.`,
      );
      return undefined;
    }

    // Read what the symbolic link points to.
    const xcodePath = fs.readlinkSync(XCODE_SELECT_LINK_PATH);

    if (xcodePath === "") {
      logger.warning(
        `Resolving ${XCODE_SELECT_LINK_PATH} unexpectedly returned nothing.`,
      );
      return undefined;
    }

    // Try to extract the version from the path.
    const matchResult = xcodePath.match(XCODE_APP_FILENAME_PATTERN);

    if (matchResult?.groups === undefined) {
      logger.warning(
        `Xcode path '${xcodePath}' does not contain expected pattern.`,
      );
      return undefined;
    }

    const majorMinor = matchResult.groups["majorMinor"];
    const version = semver.coerce(majorMinor);

    if (version === null) {
      logger.warning(`Couldn't parse '${majorMinor}' as a semantic version.`);
      return undefined;
    }
    return version;
  } catch (err) {
    logger.warning(
      `Unable to determine Xcode version: ${getErrorMessage(err)}`,
    );
    return undefined;
  }
}
