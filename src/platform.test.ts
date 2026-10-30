import fs from "fs";

import test from "ava";
import * as sinon from "sinon";

import {
  BundlePlatform,
  getBundlePlatform,
  darwinVersion,
  XCODE_SELECT_LINK_PATH,
  xcodeVersion,
} from "./platform";
import {
  checkExpectedLogMessages,
  initAllState,
  RecordingLogger,
  setupTests,
} from "./testing-utils";

setupTests(test);

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
  test(`darwinVersion returns undefined on ${platform}`, (t) => {
    t.is(darwinVersion(initAllState({ platform })), undefined);
  });
}

test("darwinVersion returns raw string if semver parsing fails", (t) => {
  const invalidSemVer = "sealOS-2026";
  t.is(
    darwinVersion(
      initAllState({ platform: "darwin", osRelease: invalidSemVer }),
    ),
    invalidSemVer,
  );
});

test("darwinVersion returns semver if parsing succeeds", (t) => {
  const validSemVer = "27.0.1";

  const version = darwinVersion(
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

test.serial("xcodeVersion returns undefined if symlink doesn't exist", (t) => {
  const logger = new RecordingLogger();

  const readlinkSync = sinon
    .stub(fs, "readlinkSync")
    .throws(new Error("ENOENT: no such file or directory"));

  t.is(xcodeVersion(logger), undefined);
  t.is(readlinkSync.callCount, 1);
  t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

  checkExpectedLogMessages(t, logger.messages, [
    "Unable to determine Xcode version: ENOENT: no such file or directory",
  ]);
});

test.serial("xcodeVersion returns undefined if file is not a symlink", (t) => {
  const logger = new RecordingLogger();

  const readlinkSync = sinon
    .stub(fs, "readlinkSync")
    .throws(new Error("EINVAL: invalid argument"));

  t.is(xcodeVersion(logger), undefined);
  t.is(readlinkSync.callCount, 1);
  t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

  checkExpectedLogMessages(t, logger.messages, [
    "Unable to determine Xcode version: EINVAL: invalid argument",
  ]);
});

test.serial(
  "xcodeVersion returns undefined if resolving the symlink returns nothing",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon.stub(fs, "readlinkSync").returns("");

    t.is(xcodeVersion(logger), undefined);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "unexpectedly returned nothing",
    ]);
  },
);

test.serial(
  "xcodeVersion returns undefined if resolved path doesn't include pattern",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .returns("/Applications/Xcode.app/Contents/Developer");

    t.is(xcodeVersion(logger), undefined);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "does not contain expected pattern",
    ]);
  },
);

test.serial("xcodeVersion returns undefined if match can't be parsed", (t) => {
  const logger = new RecordingLogger();

  const readlinkSync = sinon
    .stub(fs, "readlinkSync")
    .returns("/Applications/Xcode_00.0.app/Contents/Developer");

  t.is(xcodeVersion(logger), undefined);
  t.is(readlinkSync.callCount, 1);
  t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

  checkExpectedLogMessages(t, logger.messages, [
    "Couldn't parse '00.0' as a semantic version.",
  ]);
});

test.serial("xcodeVersion returns version from resolved path", (t) => {
  const logger = new RecordingLogger();

  const readlinkSync = sinon
    .stub(fs, "readlinkSync")
    .returns("/Applications/Xcode_16.4.app/Contents/Developer");

  const result = xcodeVersion(logger);

  if (t.truthy(result)) {
    t.is(result.major, 16);
    t.is(result.minor, 4);
  }

  t.is(readlinkSync.callCount, 1);
  t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);
});

test.serial("xcodeVersion returns major version from resolved path", (t) => {
  const logger = new RecordingLogger();

  const readlinkSync = sinon
    .stub(fs, "readlinkSync")
    .returns("/Applications/Xcode_16.app/Contents/Developer");

  const result = xcodeVersion(logger);

  if (t.truthy(result)) {
    t.is(result.major, 16);
    t.is(result.minor, 0);
  }

  t.is(readlinkSync.callCount, 1);
  t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);
});

test.serial(
  "xcodeVersion allows more version components in resolved path",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .returns("/Applications/Xcode_16.5.9.app/Contents/Developer");

    const result = xcodeVersion(logger);

    if (t.truthy(result)) {
      t.is(result.major, 16);
      t.is(result.minor, 5);
    }

    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);
  },
);
