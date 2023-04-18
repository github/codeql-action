import * as fs from 'fs';
import * as github from '@actions/github';

interface BundleInfo {
  bundleVersion: string;
  cliVersion: string;
}

interface Defaults {
  bundleVersion: string;
  cliVersion: string;
  priorBundleVersion: string;
  priorCliVersion: string;
}

function getCodeQLCliVersionForRelease(release): string {
  // We do not currently tag CodeQL bundles based on the CLI version they contain.
  // Instead, we use a marker file `cli-version-<version>.txt` to record the CLI version.
  // This marker file is uploaded as a release asset for all new CodeQL bundles.
  const cliVersionsFromMarkerFiles = release.assets
    .map((asset) => asset.name.match(/cli-version-(.*)\.txt/)?.[1])
    .filter((v) => v)
    .map((v) => v as string);
  if (cliVersionsFromMarkerFiles.length > 1) {
    throw new Error(
      `Release ${release.tag_name} has multiple CLI version marker files.`
    );
  } else if (cliVersionsFromMarkerFiles.length === 0) {
    throw new Error(
      `Failed to find the CodeQL CLI version for release ${release.tag_name}.`
    );
  }
  return cliVersionsFromMarkerFiles[0];
}

async function getBundleInfoFromRelease(release): Promise<BundleInfo> {
  return {
    bundleVersion: release.tag_name,
    cliVersion: getCodeQLCliVersionForRelease(release)
  };
}

async function getNewDefaults(currentDefaults: Defaults): Promise<Defaults> {
  const release = github.context.payload.release;
  console.log('Updating default bundle as a result of the following release: ' +
    `${JSON.stringify(release)}.`)

  const bundleInfo = await getBundleInfoFromRelease(release);
  return {
    bundleVersion: bundleInfo.bundleVersion,
    cliVersion: bundleInfo.cliVersion,
    priorBundleVersion: currentDefaults.bundleVersion,
    priorCliVersion: currentDefaults.cliVersion
  };
}

async function main() {
  const previousDefaults: Defaults = JSON.parse(fs.readFileSync('../../../src/defaults.json', 'utf8'));
  const newDefaults = await getNewDefaults(previousDefaults);
  // Update the source file in the repository. Calling workflows should subsequently rebuild
  // the Action to update `lib/defaults.json`.
  fs.writeFileSync('../../../src/defaults.json', JSON.stringify(newDefaults, null, 2) + "\n");
}

// Ideally, we'd await main() here, but that doesn't work well with `ts-node`.
// So instead we rely on the fact that Node won't exit until the event loop is empty.
main();
