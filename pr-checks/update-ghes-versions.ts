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
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  main();
}
