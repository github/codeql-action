#!/usr/bin/env npx tsx

/**
 * Updates src/api-compatibility.json with the current range of supported
 * GitHub Enterprise Server versions by reading the releases.json file from
 * an `enterprise-releases` checkout.
 */

import * as fs from "node:fs";

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


function main() {
  const enterpriseReleasesPath = process.env[EnvVar.ENTERPRISE_RELEASES_PATH];
  if (!enterpriseReleasesPath) {
    throw new Error(
      `${EnvVar.ENTERPRISE_RELEASES_PATH} environment variable must be set`,
    );
  }

  // Get the version compatibility data stored in the repo.
  const apiCompatibilityData = readApiCompatibility();
}

// Only call `main` if this script was run directly.
if (require.main === module) {
  main();
}
