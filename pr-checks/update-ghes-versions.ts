#!/usr/bin/env npx tsx

/**
 * Updates src/api-compatibility.json with the current range of supported
 * GitHub Enterprise Server versions by reading the releases.json file from
 * an `enterprise-releases` checkout.
 */

import { type SemVer } from "semver";
import * as semver from "semver";

import { API_COMPATIBILITY_FILE } from "./config";

/** The first GHES version that included Code Scanning. */
const FIRST_SUPPORTED_RELEASE: SemVer = new semver.SemVer("2.22.0");

/** Environment variables specific to this script. */
export enum EnvVar {
  ENTERPRISE_RELEASES_PATH = "ENTERPRISE_RELEASES_PATH",
}

function main() {
  const enterpriseReleasesPath = process.env[EnvVar.ENTERPRISE_RELEASES_PATH];
  if (!enterpriseReleasesPath) {
    throw new Error(
      `${EnvVar.ENTERPRISE_RELEASES_PATH} environment variable must be set`,
    );
  }
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  main();
}
