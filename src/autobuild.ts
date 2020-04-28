import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as path from 'path';

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
    const language = process.env[sharedEnv.CODEQL_ACTION_TRACED_LANGUAGES]?.split(',')[0];

    if (!language) {
      core.info("None of the languages in this project require extra build steps");
      return;
    }

    core.debug(`Detected dominant traced language: ${language}`);

    core.startGroup(`Attempting to automatically build ${language} code`);
    // TODO: share config accross actions better via env variables
    const codeqlCmd = util.getRequiredEnvParam(sharedEnv.CODEQL_ACTION_CMD);

    const cmdName = process.platform === 'win32' ? 'autobuild.cmd' : 'autobuild.sh';
    const autobuildCmd = path.join(path.dirname(codeqlCmd), language, 'tools', cmdName);


    // Update JAVA_TOOL_OPTIONS to contain '-Dhttp.keepAlive=false'
    // This is because of an issue with Azure pipelines timing out connections after 4 minutes
    // and Maven not properly handling closed connections
    // Otherwise long build processes will timeout when pulling down Java packages
    // https://developercommunity.visualstudio.com/content/problem/292284/maven-hosted-agent-connection-timeout.html
    let javaToolOptions = process.env['JAVA_TOOL_OPTIONS'] || "";
    process.env['JAVA_TOOL_OPTIONS'] = [...javaToolOptions.split(/\s+/), '-Dhttp.keepAlive=false', '-Dmaven.wagon.http.pool=false'].join(' ');

    await exec.exec(autobuildCmd);
    core.endGroup();

  } catch (error) {
    core.setFailed(error.message);
    await util.reportActionFailed('autobuild', error.message, error.stack);
    return;
  }

  await util.reportActionSucceeded('autobuild');
}

run().catch(e => {
  core.setFailed("autobuild action failed: " + e);
  console.log(e);
});
