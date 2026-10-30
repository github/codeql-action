import fs from "fs";

import type { ExecOptions } from "@actions/exec/lib/interfaces";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as io from "@actions/io";
import test from "ava";
import * as sinon from "sinon";

import {
  BundlePlatform,
  getBundlePlatform,
  darwinVersion,
  XCODE_SELECT_LINK_PATH,
  xcodeVersionFromLink,
  xcodeVersionFromSdk,
  xcodeVersionFromXcodeBuild,
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

test.serial(
  "xcodeVersionFromLink returns undefined if symlink doesn't exist",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .throws(new Error("ENOENT: no such file or directory"));

    t.is(xcodeVersionFromLink(logger), undefined);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "Unable to determine Xcode version: ENOENT: no such file or directory",
    ]);
  },
);

test.serial(
  "xcodeVersionFromLink returns undefined if file is not a symlink",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .throws(new Error("EINVAL: invalid argument"));

    t.is(xcodeVersionFromLink(logger), undefined);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "Unable to determine Xcode version: EINVAL: invalid argument",
    ]);
  },
);

test.serial(
  "xcodeVersionFromLink returns undefined if resolving the symlink returns nothing",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon.stub(fs, "readlinkSync").returns("");

    t.is(xcodeVersionFromLink(logger), undefined);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "unexpectedly returned nothing",
    ]);
  },
);

test.serial(
  "xcodeVersionFromLink returns undefined if resolved path doesn't include pattern",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .returns("/Applications/Xcode.app/Contents/Developer");

    t.is(xcodeVersionFromLink(logger), undefined);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "does not contain expected pattern",
    ]);
  },
);

test.serial(
  "xcodeVersionFromLink returns undefined if match can't be parsed",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .returns("/Applications/Xcode_00.0.app/Contents/Developer");

    t.is(xcodeVersionFromLink(logger), undefined);
    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);

    checkExpectedLogMessages(t, logger.messages, [
      "Couldn't parse '00.0' as a semantic version.",
    ]);
  },
);

test.serial("xcodeVersionFromLink returns version from resolved path", (t) => {
  const logger = new RecordingLogger();

  const readlinkSync = sinon
    .stub(fs, "readlinkSync")
    .returns("/Applications/Xcode_16.4.app/Contents/Developer");

  const result = xcodeVersionFromLink(logger);

  if (t.truthy(result)) {
    t.is(result.major, 16);
    t.is(result.minor, 4);
  }

  t.is(readlinkSync.callCount, 1);
  t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);
});

test.serial(
  "xcodeVersionFromLink returns major version from resolved path",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .returns("/Applications/Xcode_16.app/Contents/Developer");

    const result = xcodeVersionFromLink(logger);

    if (t.truthy(result)) {
      t.is(result.major, 16);
      t.is(result.minor, 0);
    }

    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);
  },
);

test.serial(
  "xcodeVersionFromLink allows more version components in resolved path",
  (t) => {
    const logger = new RecordingLogger();

    const readlinkSync = sinon
      .stub(fs, "readlinkSync")
      .returns("/Applications/Xcode_16.5.9.app/Contents/Developer");

    const result = xcodeVersionFromLink(logger);

    if (t.truthy(result)) {
      t.is(result.major, 16);
      t.is(result.minor, 5);
    }

    t.is(readlinkSync.callCount, 1);
    t.deepEqual(readlinkSync.args[0], [XCODE_SELECT_LINK_PATH]);
  },
);

test.serial(
  "xcodeVersionFromXcodeBuild returns undefined for non-zero exit code",
  async (t) => {
    const logger = new RecordingLogger();

    const which = sinon.stub(io, "which").resolves("/path/to/xcrun");
    const exec = sinon.stub<[], Promise<number>>().resolves(1);
    const runner = sinon.createStubInstance(toolrunner.ToolRunner, { exec });
    const toolrunnerStub = sinon.stub(toolrunner, "ToolRunner").returns(runner);

    await t.notThrowsAsync(async () => {
      const result = await xcodeVersionFromXcodeBuild(logger);

      t.is(result, undefined);

      t.is(which.callCount, 1);
      t.deepEqual(which.args[0], ["xcrun", true]);

      t.is(toolrunnerStub.callCount, 1);
      t.is(exec.callCount, 1);

      checkExpectedLogMessages(t, logger.messages, [
        "xcodebuild returned exit code 1",
      ]);
    });
  },
);

test.serial(
  "xcodeVersionFromXcodeBuild extracts version from xcrun stdout",
  async (t) => {
    const logger = new RecordingLogger();

    const which = sinon.stub(io, "which").resolves("/path/to/xcrun");

    let stdoutListener: ((data: Buffer) => void) | undefined = undefined;
    const exec = sinon.stub<[], Promise<number>>().callsFake(async () => {
      if (stdoutListener !== undefined) {
        stdoutListener(Buffer.from("Xcode 26.5"));
        stdoutListener(Buffer.from("Build version 26F9"));
      }
      return 0;
    });
    const runner = sinon.createStubInstance(toolrunner.ToolRunner, { exec });

    const toolrunnerStub = sinon
      .stub(toolrunner, "ToolRunner")
      .callsFake((_cmd, _args, opts: ExecOptions) => {
        stdoutListener = opts.listeners?.stdout;
        return runner;
      });

    await t.notThrowsAsync(async () => {
      const result = await xcodeVersionFromXcodeBuild(logger);

      t.not(result, undefined);
      t.is(result?.major, 26);
      t.is(result?.minor, 5);

      t.is(which.callCount, 1);
      t.deepEqual(which.args[0], ["xcrun", true]);

      t.is(toolrunnerStub.callCount, 1);
      t.is(exec.callCount, 1);
    });
  },
);

test.serial(
  "xcodeVersionFromSdk returns undefined for non-zero exit code",
  async (t) => {
    const logger = new RecordingLogger();

    const which = sinon.stub(io, "which").resolves("/path/to/xcrun");
    const exec = sinon.stub<[], Promise<number>>().resolves(1);
    const runner = sinon.createStubInstance(toolrunner.ToolRunner, { exec });
    const toolrunnerStub = sinon.stub(toolrunner, "ToolRunner").returns(runner);

    await t.notThrowsAsync(async () => {
      const result = await xcodeVersionFromSdk(logger);

      t.is(result, undefined);

      t.is(which.callCount, 1);
      t.deepEqual(which.args[0], ["xcrun", true]);

      t.is(toolrunnerStub.callCount, 1);
      t.is(exec.callCount, 1);

      checkExpectedLogMessages(t, logger.messages, [
        "xcrun returned exit code 1",
      ]);
    });
  },
);

test.serial(
  "xcodeVersionFromSdk extracts version from xcrun stdout",
  async (t) => {
    const logger = new RecordingLogger();

    const which = sinon.stub(io, "which").resolves("/path/to/xcrun");

    let stdoutListener: ((data: Buffer) => void) | undefined = undefined;
    const exec = sinon.stub<[], Promise<number>>().callsFake(async () => {
      if (stdoutListener !== undefined) {
        stdoutListener(Buffer.from("26.5"));
      }
      return 0;
    });
    const runner = sinon.createStubInstance(toolrunner.ToolRunner, { exec });

    const toolrunnerStub = sinon
      .stub(toolrunner, "ToolRunner")
      .callsFake((_cmd, _args, opts: ExecOptions) => {
        stdoutListener = opts.listeners?.stdout;
        return runner;
      });

    await t.notThrowsAsync(async () => {
      const result = await xcodeVersionFromSdk(logger);

      t.not(result, undefined);
      t.is(result?.major, 26);
      t.is(result?.minor, 5);

      t.is(which.callCount, 1);
      t.deepEqual(which.args[0], ["xcrun", true]);

      t.is(toolrunnerStub.callCount, 1);
      t.is(exec.callCount, 1);
    });
  },
);
