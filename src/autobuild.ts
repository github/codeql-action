import * as core from '@actions/core';

import { getCodeQL } from './codeql';
import * as sharedEnv from './shared-environment';
import * as util from './util';

async function run() {
  try {
    if (util.should_abort('autobuild', true) || !await util.reportActionStarting('autobuild')) {
      return;
    }

    // Attempt to find a language to autobuild
    // We want pick the dominant language in the repo from the ones we're able to build
    // The languages are sorted in order specified by user or by lines of code if we got
    // them from the GitHub API, so try to build the first language on the list.
    const autobuildLanguages = process.env[sharedEnv.CODEQL_ACTION_TRACED_LANGUAGES]?.split(',') || [];
    const language = autobuildLanguages[0];

    if (!language) {
      core.info("None of the languages in this project require extra build steps");
      return;
    }

    core.debug(`Detected dominant traced language: ${language}`);

    if (autobuildLanguages.length > 1) {
      core.warning(`We will only automatically build ${language} code. If you wish to scan ${autobuildLanguages.slice(1).join(' and ')}, you must replace this block with custom build steps.`);
    }

    core.startGroup(`Attempting to automatically build ${language} code`);
    const codeQL = getCodeQL();
    await codeQL.runAutobuild(language);

    core.endGroup();

  } catch (error) {
    core.setFailed("We were unable to automatically build your code. Please replace the call to the autobuild action with your custom build steps.  " + error.message);
    await util.reportActionFailed('autobuild', error.message, error.stack);
    return;
  }

  await util.reportActionSucceeded('autobuild');
}

run().catch(e => {
  core.setFailed("autobuild action failed.  " + e);
  console.log(e);
});
