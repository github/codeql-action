import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

import * as configUtils from './config-utils';
import * as util from './util';

export async function checkoutExternalQueries(config: configUtils.Config) {
  const folder = util.getRequiredEnvParam('RUNNER_TEMP');

  for (const externalQuery of config.externalQueries) {
    core.info('Checking out ' + externalQuery.repository);

    const checkoutLocation = path.join(folder, externalQuery.repository);
    if (!fs.existsSync(checkoutLocation)) {
      const repoURL = 'https://github.com/' + externalQuery.repository + '.git';
      await exec.exec('git', ['clone', repoURL, checkoutLocation]);
      await exec.exec('git', [
        '--work-tree=' + checkoutLocation,
        '--git-dir=' + checkoutLocation + '/.git',
        'checkout', externalQuery.ref,
      ]);
    }

    config.additionalQueries.push(path.join(checkoutLocation, externalQuery.path));
  }
}
