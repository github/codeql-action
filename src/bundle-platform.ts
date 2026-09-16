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
