import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Check out repository at the given ref, and return the directory of the checkout.
 */
export async function checkoutExternalRepository(repository: string, ref: string, tempDir: string): Promise<string> {
  core.info('Checking out ' + repository);

  const checkoutLocation = path.join(tempDir, repository);
  if (!fs.existsSync(checkoutLocation)) {
    const repoURL = 'https://github.com/' + repository + '.git';
    await exec.exec('git', ['clone', repoURL, checkoutLocation]);
    await exec.exec('git', [
      '--work-tree=' + checkoutLocation,
      '--git-dir=' + checkoutLocation + '/.git',
      'checkout', ref,
    ]);
  }

  return checkoutLocation;
}
