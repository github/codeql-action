import test from "ava";

import { BundlePlatform, getBundlePlatform } from "./bundle-platform";

for (const [platform, arch, expected] of [
  ["linux", "x64", BundlePlatform.Linux64],
  ["linux", "arm64", BundlePlatform.LinuxArm64],
  ["linux", "ia32", BundlePlatform.Linux64],
  ["darwin", "x64", BundlePlatform.Osx64],
  ["darwin", "arm64", BundlePlatform.Osx64],
  ["win32", "x64", BundlePlatform.Win64],
  ["win32", "arm64", BundlePlatform.Win64],
  ["freebsd", "x64", undefined],
] as const) {
  test(`getBundlePlatform maps ${platform}/${arch} to ${expected ?? "an all-platform bundle"}`, (t) => {
    t.is(getBundlePlatform(platform, arch), expected);
  });
}
