#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

const scriptDir = __dirname;
const grandparentDir = path.dirname(path.dirname(scriptDir));

// Read configuration from releases.ini
const releasesIniPath = path.join(grandparentDir, 'releases.ini');
const releasesIniContent = fs.readFileSync(releasesIniPath, 'utf8');
const oldestSupportedMajorVersionMatch = releasesIniContent.match(/OLDEST_SUPPORTED_MAJOR_VERSION=(\d+)/);
if (!oldestSupportedMajorVersionMatch) {
  throw new Error('Could not find OLDEST_SUPPORTED_MAJOR_VERSION in releases.ini');
}
const OLDEST_SUPPORTED_MAJOR_VERSION = parseInt(oldestSupportedMajorVersionMatch[1], 10);

interface Args {
  majorVersion?: string;
  latestTag?: string;
}

function parseArgs(): Args {
  const args: Args = {};
  
  for (let i = 2; i < process.argv.length; i++) {
    switch (process.argv[i]) {
      case '--major-version':
        args.majorVersion = process.argv[++i];
        break;
      case '--latest-tag':
        args.latestTag = process.argv[++i];
        break;
    }
  }
  
  return args;
}

function writeToGithubOutput(key: string, value: string): void {
  const githubOutputPath = process.env.GITHUB_OUTPUT;
  if (githubOutputPath) {
    fs.appendFileSync(githubOutputPath, `${key}=${value}\n`);
  }
}

function main(): void {
  const args = parseArgs();
  
  if (!args.majorVersion || !args.latestTag) {
    throw new Error('--major-version and --latest-tag are required');
  }

  const majorVersion = args.majorVersion;
  const latestTag = args.latestTag;

  console.log(`major_version: ${majorVersion}`);
  console.log(`latest_tag: ${latestTag}`);

  // If this is a primary release, we backport to all supported branches,
  // so we check whether the major_version taken from the package.json
  // is greater than or equal to the latest tag pulled from the repo.
  // For example...
  //     'v1' >= 'v2' is False # we're operating from an older release branch and should not backport
  //     'v2' >= 'v2' is True  # the normal case where we're updating the current version
  //     'v3' >= 'v2' is True  # in this case we are making the first release of a new major version
  const considerBackports = majorVersion >= latestTag.split('.')[0];

  writeToGithubOutput('backport_source_branch', `releases/${majorVersion}`);

  const backportTargetBranches: string[] = [];

  if (considerBackports) {
    const majorVersionNumber = parseInt(majorVersion.replace('v', ''), 10);
    for (let i = majorVersionNumber - 1; i > 0; i--) {
      if (i >= OLDEST_SUPPORTED_MAJOR_VERSION) {
        backportTargetBranches.push(`releases/v${i}`);
      }
    }
  }

  writeToGithubOutput('backport_target_branches', JSON.stringify(backportTargetBranches));
}

if (require.main === module) {
  main();
}