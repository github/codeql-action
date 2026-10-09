import test from "ava";

import { BundlePlatform, getBundlePlatform, macOSVersion } from "./platform";
import { initAllState } from "./testing-utils";

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

const platforms: NodeJS.Platform[] = ["linux", "win32", "freebsd"];
for (const platform of platforms) {
  test(`macOSVersion returns undefined on ${platform}`, (t) => {
    t.is(macOSVersion(initAllState({ platform })), undefined);
  });
}

test("macOSVersion returns raw string if semver parsing fails", (t) => {
  const invalidSemVer = "sealOS-2026";
  t.is(
    macOSVersion(
      initAllState({ platform: "darwin", osRelease: invalidSemVer }),
    ),
    invalidSemVer,
  );
});

test("macOSVersion returns semver if parsing succeeds", (t) => {
  const validSemVer = "27.0.1";

  const version = macOSVersion(
    initAllState({ platform: "darwin", osRelease: validSemVer }),
  );

  // Check that `version` is not undefined and narrow the type; throws if undefined.
  if (t.truthy(version)) {
    // Check that it's also not just a string.
    t.not(typeof version, "string");

    // Should be an object with the expected properties.
    t.is(typeof version, "object");
    t.is(version["major"], 27);
    t.is(version["minor"], 0);
    t.is(version["patch"], 1);
  }
});
