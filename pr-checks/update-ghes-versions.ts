#!/usr/bin/env npx tsx

/**
 * Updates src/api-compatibility.json with the current range of supported
 * GitHub Enterprise Server versions by reading the releases.json file from
 * an `enterprise-releases` checkout.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { type SemVer } from "semver";
import * as semver from "semver";

import * as json from "../src/json";

import { API_COMPATIBILITY_FILE } from "./config";

/** The first GHES version that included Code Scanning. */
const FIRST_SUPPORTED_RELEASE: SemVer = new semver.SemVer("2.22.0");

/** Environment variables specific to this script. */
export enum EnvVar {
  ENTERPRISE_RELEASES_PATH = "ENTERPRISE_RELEASES_PATH",
}

/**
 * The semver specification requires three numeric components, but GHES release families
 * only have two. This function uses `semver.coerce` to first coerce the version string
 * into an acceptable input for `semver.parse`. E.g. `3.10` becomes `3.10.0`.
 */
export function parseEnterpriseVersion(val: string): SemVer | null {
  return semver.parse(semver.coerce(val));
}

/**
 * Mirroring `parseEnterpriseVersion`, this function returns only the major and minor
 * version components from `ver`.
 */
export function printEnterpriseVersion(ver: SemVer) {
  if (ver.patch === 0) {
    return `${ver.major}.${ver.minor}`;
  }
  return ver.toString();
}

/** The JSON schema for `API_COMPATIBILITY_FILE`. */
const apiCompatibilitySchema = {
  minimumVersion: json.string,
  maximumVersion: json.string,
} as const satisfies json.Schema;

/** The type representing the expected contents of `API_COMPATIBILITY_FILE`. */
type ApiCompatibility = json.FromSchema<typeof apiCompatibilitySchema>;

/** Reads the current contents of the `API_COMPATIBILITY_FILE` file. */
export function readApiCompatibility(): ApiCompatibility {
  const apiCompatibilityData: unknown = JSON.parse(
    fs.readFileSync(API_COMPATIBILITY_FILE, "utf8"),
  );

  if (!json.isObject(apiCompatibilityData)) {
    throw new Error(
      `Expected '${API_COMPATIBILITY_FILE}' to contain an object.`,
    );
  }
  if (!json.validateSchema(apiCompatibilitySchema, apiCompatibilityData)) {
    throw new Error(
      `The contents of '${API_COMPATIBILITY_FILE}' do not match the expected JSON schema.`,
    );
  }

  return apiCompatibilityData;
}

/** The JSON schema for entries in the `releases.json` file. */
const releaseDataSchema = {
  feature_freeze: json.string,
  end: json.string,
} as const satisfies json.Schema;

/** The type representing entries in the `releases.json` file. */
export type ReleaseData = json.FromSchema<typeof releaseDataSchema>;

/** A mapping from GHES releases to release information. */
export type EnterpriseReleases = Record<string, ReleaseData>;

/** Reads information about GHES releases. */
export function readEnterpriseReleases(
  enterpriseReleasesPath: string,
): EnterpriseReleases {
  const releaseFilePath = path.join(enterpriseReleasesPath, "releases.json");
  const releases: unknown = JSON.parse(
    fs.readFileSync(releaseFilePath, "utf8"),
  );

  if (!json.isObject(releases)) {
    throw new Error(`Expected '${releaseFilePath}' to contain an object.`);
  }

  // Remove GHES version using a previous version numbering scheme.
  delete releases["11.10"];

  // Validate that the object satisfies the schema.
  for (const [, releaseData] of Object.entries(releases)) {
    if (!json.isObject(releaseData)) {
      throw new Error(
        `Expected release data to be an object, but it is ${typeof releaseData}.`,
      );
    }
    if (!json.validateSchema(releaseDataSchema, releaseData)) {
      throw new Error("Expected release data to satisfy schema.");
    }
  }

  return releases;
}

/** Adds `weeks`-many weeks to the UTC date of `date`. */
export function addWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setUTCDate(date.getUTCDate() + weeks * 7);
  return result;
}

/** Determines the current range of GHES versions we should support. */
export function determineSupportedRange(
  apiCompatibilityData: ApiCompatibility,
  releases: EnterpriseReleases,
): ApiCompatibility {
  // Our goal is to identify the oldest and newest GHES release we should support.
  // We begin with `oldestSupportRelease = undefined` so that we determine the
  // minimum from scratch and don't stick to `apiCompatibilityData.minimumVersion`
  // when it is no longer supported.
  // For `newestSupportedRelease`, we assume that `apiCompatibilityData.maximumVersion`
  // is guaranteed to not be outdated.
  let oldestSupportedRelease: SemVer | undefined;
  let newestSupportedRelease = parseEnterpriseVersion(
    apiCompatibilityData.maximumVersion,
  );

  if (newestSupportedRelease === null) {
    throw new Error(
      `${apiCompatibilityData.maximumVersion} is not a valid semantic version.`,
    );
  }

  const today = new Date();

  // NOTE: We deliberately omit including any data from `releases` in the error messages below.

  for (const [releaseVersionString, releaseData] of Object.entries(releases)) {
    const releaseVersion = parseEnterpriseVersion(releaseVersionString);

    if (releaseVersion === null) {
      throw new Error("Invalid enterprise release version.");
    }

    // Ignore GHES releases older than `FIRST_SUPPORTED_RELEASE`.
    if (semver.compare(releaseVersion, FIRST_SUPPORTED_RELEASE) < 0) {
      continue;
    }

    // If the GHES release is newer than the current, newest release we support,
    // check whether at least two weeks have passed since the feature freeze date
    // so we don't set `newestSupportedRelease` too early.
    if (semver.compare(releaseVersion, newestSupportedRelease) > 0) {
      const featureFreezeDate = new Date(releaseData.feature_freeze);
      if (featureFreezeDate < addWeeks(today, 2)) {
        newestSupportedRelease = releaseVersion;
      }
    }

    if (
      oldestSupportedRelease === undefined ||
      semver.compare(releaseVersion, oldestSupportedRelease) < 0
    ) {
      const endOfLifeDate = new Date(releaseData.end);
      // The GHES version is not actually end of life until the end of the day
      // specified by `endOfLifeDate`. Wait an extra week to be safe.
      const isEndOfLife = today > addWeeks(endOfLifeDate, 1);
      if (!isEndOfLife) {
        oldestSupportedRelease = releaseVersion;
      }
    }
  }

  if (!oldestSupportedRelease) {
    throw new Error("Could not determine oldest supported release.");
  }

  return {
    maximumVersion: printEnterpriseVersion(newestSupportedRelease),
    minimumVersion: printEnterpriseVersion(oldestSupportedRelease),
  };
}

function main() {
  const enterpriseReleasesPath = process.env[EnvVar.ENTERPRISE_RELEASES_PATH];
  if (!enterpriseReleasesPath) {
    throw new Error(
      `${EnvVar.ENTERPRISE_RELEASES_PATH} environment variable must be set`,
    );
  }

  // Get the version compatibility data stored in the repo.
  const apiCompatibilityData = readApiCompatibility();

  // Get the GHES release information.
  const releases = readEnterpriseReleases(enterpriseReleasesPath);

  // Determine the supported range.
  const newCompatibilityData: ApiCompatibility = determineSupportedRange(
    apiCompatibilityData,
    releases,
  );

  // If the version range has changed, write the updates to `API_COMPATIBILITY_FILE`.
  if (
    newCompatibilityData.minimumVersion !==
      apiCompatibilityData.minimumVersion ||
    newCompatibilityData.maximumVersion !== apiCompatibilityData.maximumVersion
  ) {
    const data = JSON.stringify(newCompatibilityData);
    fs.writeFileSync(API_COMPATIBILITY_FILE, `${data}\n`);

    console.log(
      `Updated '${path.basename(API_COMPATIBILITY_FILE)}': ${newCompatibilityData.minimumVersion} - ${newCompatibilityData.maximumVersion}`,
    );
  } else {
    console.log(
      `No changes, not writing to '${path.basename(API_COMPATIBILITY_FILE)}'.`,
    );
  }
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  main();
}
