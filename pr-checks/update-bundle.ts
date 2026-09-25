#!/usr/bin/env npx tsx

/** Updates 'src/defaults.json' to point to a new CodeQL bundle release. */

import * as fs from "fs";

import * as github from "@actions/github";

import * as defaults from "../src/defaults.json";

import { DEFAULTS_FILE } from "./config";

interface BundleInfo {
  bundleVersion: string;
  cliVersion: string;
}

export type Defaults = typeof defaults;

interface Release {
  tag_name: string;
  assets: Array<{
    name: string;
  }>;
}

function getCodeQLCliVersionForRelease(release: Release): string {
  // We do not currently tag CodeQL bundles based on the CLI version they contain.
  // Instead, we use a marker file `cli-version-<version>.txt` to record the CLI version.
  // This marker file is uploaded as a release asset for all new CodeQL bundles.
  const cliVersionsFromMarkerFiles = release.assets
    .map((asset) => asset.name.match(/cli-version-(.*)\.txt/)?.[1])
    .filter((v) => v)
    .map((v) => v as string);
  if (cliVersionsFromMarkerFiles.length > 1) {
    throw new Error(
      `Release ${release.tag_name} has multiple CLI version marker files.`,
    );
  } else if (cliVersionsFromMarkerFiles.length === 0) {
    throw new Error(
      `Failed to find the CodeQL CLI version for release ${release.tag_name}.`,
    );
  }
  return cliVersionsFromMarkerFiles[0];
}

function getBundleInfoFromRelease(release: Release): BundleInfo {
  return {
    bundleVersion: release.tag_name,
    cliVersion: getCodeQLCliVersionForRelease(release),
  };
}

export function getNewDefaults(
  release: Release,
  currentDefaults: Defaults,
): Defaults {
  console.log(
    "Updating default bundle as a result of the following release: " +
      `${JSON.stringify(release)}.`,
  );

  const bundleInfo = getBundleInfoFromRelease(release);

  return {
    bundleVersion: bundleInfo.bundleVersion,
    cliVersion: bundleInfo.cliVersion,
    priorBundleVersion: currentDefaults.bundleVersion,
    priorCliVersion: currentDefaults.cliVersion,
  };
}

function main() {
  const release: Release = github.context.payload.release;

  if (release === undefined) {
    console.error(`Release payload is undefined.`);
    return -1;
  }

  const previousDefaults = defaults;
  const newDefaults = getNewDefaults(release, previousDefaults);

  // Update the source file in the repository. Calling workflows should subsequently rebuild
  // the Action to update `lib/defaults.json`.
  fs.writeFileSync(DEFAULTS_FILE, `${JSON.stringify(newDefaults, null, 2)}\n`);

  return 0;
}

if (require.main === module) {
  process.exit(main());
}
