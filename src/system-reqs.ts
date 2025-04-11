// Enforce system requirements for the CodeQL CLI.
// https://codeql.github.com/docs/codeql-overview/system-requirements/

import { readFileSync } from "fs";
import os from "os";

import { isMacOSVersionGreaterThanOrEqualTo } from "macos-version";

import { assertNever, ConfigurationError } from "./util";

const platformMap = {
  darwin: "macOS",
  linux: "Linux",
  win32: "Windows",
};

const platformRequirements = {
  macOS: {
    version: ["13.0.1", "14.0.1"],
    arch: ["arm64", "x64"],
  },
  Linux: {
    // We only accept Ubuntu 20.04, 21.04, and 22.04
    version: ["20.04", "21.04", "22.04"],
    arch: ["x64"],
  },
  Windows: {
    version: ["10", "Server 2019", "11", "Server 2022"],
    arch: ["x64"],
  },
};

export function passesSystemRequirements(): boolean {
  // CodeQL System requirements are two-level: the CLI must run on a specific platform,
  // and that platform must have certain capabilities.

  const platform = getPlatform();
  switch (platform) {
    case "macOS":
      return checkMacOSPlatform();
    case "Linux":
      return checkLinuxPlatform();
    case "Windows":
      return checkWindowsPlatform();
    default:
      assertNever(platform);
  }
}

// MacOS checks

function checkMacOSPlatform(): boolean {
  const macOSPlatformRequirements = platformRequirements["macOS"];
  return (
    checkMacOSVersion(macOSPlatformRequirements["version"]) &&
    checkMacOSArch(macOSPlatformRequirements["arch"])
  );
}

function checkMacOSVersion(supportedVersions: string[]): boolean {
  return supportedVersions.some((version) => {
    return isMacOSVersionGreaterThanOrEqualTo(version);
  });
}

function checkMacOSArch(supportedArchs: string[]): boolean {
  const arch = getArch();
  return supportedArchs.includes(arch);
}

// Linux checks

function checkLinuxPlatform(): boolean {
  const linuxPlatformRequirements = platformRequirements["Linux"];
  return (
    checkLinuxVersion(linuxPlatformRequirements["version"]) &&
    checkLinuxArch(linuxPlatformRequirements["arch"])
  );
}

function checkLinuxVersion(supportedVersions: string[]): boolean {
  const data = readFileSync("/etc/os-release", "utf8");
  const lines = data.split("\n");
  const releaseDetails: Record<string, string> = {};
  for (const line of lines) {
    const words = line.split("=");
    if (words.length === 2) {
      releaseDetails[words[0].trim().toLowerCase()] = words[1].trim();
    }
  }

  return (
    releaseDetails.name === "Ubuntu" &&
    supportedVersions.includes(releaseDetails.version_id)
  );
}

function checkLinuxArch(supportedArchs: string[]): boolean {
  const arch = getArch();
  return supportedArchs.includes(arch);
}

// Windows checks

function checkWindowsPlatform(): boolean {
  const windowsPlatformRequirements = platformRequirements["Windows"];
  return (
    checkWindowsVersion(windowsPlatformRequirements["version"]) &&
    checkWindowsArch(windowsPlatformRequirements["arch"])
  );
}

function checkWindowsVersion(supportedVersions: string[]): boolean {
  // os.release() on windows returns a string like "Windows 11 Home"
  const windowsVersion = os.release();
  return supportedVersions.some((version) =>
    new RegExp(version, "i").test(windowsVersion),
  );
}

function checkWindowsArch(supportedArchs: string[]): boolean {
  const arch = getArch();
  return supportedArchs.includes(arch);
}

// Auxiliary functions

function getPlatform(): "macOS" | "Linux" | "Windows" {
  const platform = process.platform;
  const mappedPlatform = platformMap[platform];
  if (mappedPlatform === undefined) {
    throw new ConfigurationError(`Unsupported platform: ${platform}`);
  }
  return mappedPlatform;
}

function getArch(): string {
  return process.arch;
}
