import fs from "fs";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";
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
 * Tries to determine the version of the Darwin kernel. We use this to approximate the macOS version based
 * on the Darwin kernel version so that we don't have to launch an external process. Note that the Darwin
 * kernel major version does not correspond perfectly to the macOS major version.
 *
 * @returns
 *  The version as either a semantic version object, the raw version string
 *  if it is not a semantic version, or `undefined` if we are not on macOS.
 */
export function darwinVersion(
  action: ActionState<["Base"]>,
): semver.SemVer | string | undefined {
  // Skip if we are not running on macOS.
  if (action.platform !== "darwin") {
    return undefined;
  }

  // Try to parse the kernel version string.
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
  /(?<filename>Xcode_(?<majorMinor>\d+(\.\d+)?).*\.app)/,
);

/**
 * Tries to determine the version of Xcode that is installed from the resolved symbolic link
 * at {@link XCODE_SELECT_LINK_PATH}.
 *
 * @param logger The logger to use.
 * @returns The Xcode version or `undefined` if it couldn't be determined.
 */
export function xcodeVersionFromLink(
  logger: Logger,
): semver.SemVer | undefined {
  try {
    // Read what the symbolic link points to. This will throw if `XCODE_SELECT_LINK_PATH` does not
    // exist (`ENOENT`) or is not a symbolic link (`EINVAL`).
    const xcodePath = fs.readlinkSync(XCODE_SELECT_LINK_PATH);

    if (xcodePath.trim() === "") {
      logger.debug(
        `Resolving ${XCODE_SELECT_LINK_PATH} unexpectedly returned nothing.`,
      );
      return undefined;
    }

    // Try to extract the version from the path.
    const matchResult = xcodePath.match(XCODE_APP_FILENAME_PATTERN);

    if (matchResult?.groups === undefined) {
      logger.debug(
        `Xcode path '${xcodePath}' does not contain expected pattern.`,
      );
      return undefined;
    }

    const majorMinor = matchResult.groups["majorMinor"];
    const version = semver.coerce(majorMinor);

    if (version === null) {
      logger.debug(`Couldn't parse '${majorMinor}' as a semantic version.`);
      return undefined;
    }
    return version;
  } catch (err) {
    logger.debug(`Unable to determine Xcode version: ${getErrorMessage(err)}`);
    return undefined;
  }
}

/**
 * Tries to determine the version of Xcode that is installed by running `xcrun xcodebuild -version`.
 *
 * @param logger The logger to use.
 * @returns The Xcode version or `undefined` if it couldn't be determined.
 */
export async function xcodeVersionFromXcodeBuild(
  logger: Logger,
): Promise<semver.SemVer | undefined> {
  try {
    const xcrun = await io.which("xcrun", true);
    let stdout = "";
    let stderr = "";

    const exitCode = await new toolrunner.ToolRunner(
      xcrun,
      ["xcodebuild", "-version"],
      {
        silent: true,
        ignoreReturnCode: true,
        listeners: {
          stdout: (data: Buffer) => {
            stdout += data.toString("utf-8");
          },
          stderr: (data: Buffer) => {
            stderr += data.toString("utf-8");
          },
        },
      },
    ).exec();

    if (exitCode !== 0) {
      logger.debug(`xcodebuild returned exit code ${exitCode}`);
      logger.debug(`stdout:\n${stdout}`);
      logger.debug(`stderr:\n${stderr}`);
      return undefined;
    }

    // The output contains a couple of lines, but we only care about the product version.
    const match = stdout.match(/^Xcode (\d+(\.\d+)?)/);

    if (match === null) {
      logger.debug(
        `Output doesn't appear to contain the Xcode product version.`,
      );
      logger.debug(`stdout:\n${stdout}`);
      logger.debug(`stderr:\n${stderr}`);
      return undefined;
    }

    // We expect the output to only be a version string. Try to parse it into a semver.
    const version = semver.coerce(match[1].trim());

    if (version === null) {
      logger.debug(
        `xcodebuild's output couldn't be parsed as a version:\n${stdout}`,
      );
      logger.debug(`stderr:\n${stderr}`);
      return undefined;
    }

    return version;
  } catch (err) {
    logger.debug(
      `Unable to determine Xcode version from xcodebuild: ${getErrorMessage(err)}`,
    );
    return undefined;
  }
}

/**
 * Tries to determine the version of Xcode that is installed by running `xcrun --sdk macosx --show-sdk-version`.
 *
 * @param logger The logger to use.
 * @returns The Xcode version or `undefined` if it couldn't be determined.
 */
export async function xcodeVersionFromSdk(
  logger: Logger,
): Promise<semver.SemVer | undefined> {
  try {
    const xcrun = await io.which("xcrun", true);
    let stdout = "";
    let stderr = "";

    const exitCode = await new toolrunner.ToolRunner(
      xcrun,
      ["--sdk", "macosx", "--show-sdk-version"],
      {
        silent: true,
        ignoreReturnCode: true,
        listeners: {
          stdout: (data: Buffer) => {
            stdout += data.toString("utf-8");
          },
          stderr: (data: Buffer) => {
            stderr += data.toString("utf-8");
          },
        },
      },
    ).exec();

    if (exitCode !== 0) {
      logger.debug(`xcrun returned exit code ${exitCode}`);
      logger.debug(`stdout:\n${stdout}`);
      logger.debug(`stderr:\n${stderr}`);
      return undefined;
    }

    // We expect the output to only be a version string. Try to parse it into a semver.
    const version = semver.coerce(stdout.trim());

    if (version === null) {
      logger.debug(
        `xcrun's output couldn't be parsed as a version:\n${stdout}`,
      );
      logger.debug(`stderr:\n${stderr}`);
      return undefined;
    }

    return version;
  } catch (err) {
    logger.debug(`Unable to determine Xcode version: ${getErrorMessage(err)}`);
    return undefined;
  }
}
