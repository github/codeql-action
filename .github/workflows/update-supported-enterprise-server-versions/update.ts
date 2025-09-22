#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

const API_COMPATIBILITY_PATH = path.join(__dirname, '..', '..', '..', 'src', 'api-compatibility.json');
const ENTERPRISE_RELEASES_PATH = process.env.ENTERPRISE_RELEASES_PATH!;
const RELEASE_FILE_PATH = path.join(ENTERPRISE_RELEASES_PATH, 'releases.json');
const FIRST_SUPPORTED_RELEASE = semver.parse('2.22.0')!; // Versions older than this did not include Code Scanning.

interface ReleaseData {
  feature_freeze: string;
  end: string;
}

interface ApiCompatibility {
  minimumVersion: string;
  maximumVersion: string;
}

function main(): void {
  const apiCompatibilityData: ApiCompatibility = JSON.parse(fs.readFileSync(API_COMPATIBILITY_PATH, 'utf8'));
  const releases: Record<string, ReleaseData> = JSON.parse(fs.readFileSync(RELEASE_FILE_PATH, 'utf8'));

  // Remove GHES version using a previous version numbering scheme.
  if ('11.10' in releases) {
    delete releases['11.10'];
  }

  let oldestSupportedRelease: semver.SemVer | null = null;
  let newestSupportedRelease = semver.parse(apiCompatibilityData.maximumVersion + '.0')!;

  for (const [releaseVersionString, releaseData] of Object.entries(releases)) {
    const releaseVersion = semver.parse(releaseVersionString + '.0');
    if (!releaseVersion || semver.lt(releaseVersion, FIRST_SUPPORTED_RELEASE)) {
      continue;
    }

    if (semver.gt(releaseVersion, newestSupportedRelease)) {
      const featureFreezeDate = new Date(releaseData.feature_freeze);
      const twoWeeksFromNow = new Date();
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14);
      
      if (featureFreezeDate < twoWeeksFromNow) {
        newestSupportedRelease = releaseVersion;
      }
    }

    const endOfLifeDate = new Date(releaseData.end);
    // The GHES version is not actually end of life until the end of the day specified by
    // `end_of_life_date`. Wait an extra week to be safe.
    const oneWeekAfterEol = new Date(endOfLifeDate);
    oneWeekAfterEol.setDate(oneWeekAfterEol.getDate() + 7);
    const isEndOfLife = new Date() > oneWeekAfterEol;
    
    if (!isEndOfLife && (oldestSupportedRelease === null || semver.lt(releaseVersion, oldestSupportedRelease))) {
      oldestSupportedRelease = releaseVersion;
    }
  }

  if (!oldestSupportedRelease) {
    throw new Error('No oldest supported release found');
  }

  const updatedApiCompatibility: ApiCompatibility = {
    minimumVersion: `${oldestSupportedRelease.major}.${oldestSupportedRelease.minor}`,
    maximumVersion: `${newestSupportedRelease.major}.${newestSupportedRelease.minor}`,
  };

  fs.writeFileSync(API_COMPATIBILITY_PATH, JSON.stringify(updatedApiCompatibility, null, 2) + '\n');
}

if (require.main === module) {
  main();
}