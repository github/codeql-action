import * as core from '@actions/core';

import * as upload_lib from './upload-lib';
import * as util from './util';

async function run() {
    if (util.should_abort('upload-sarif', false) || !await util.reportActionStarting('upload-sarif')) {
        return;
    }

    try {
        await upload_lib.upload(core.getInput('sarif_file'));
    } catch (error) {
        core.setFailed(error.message);
        await util.reportActionFailed('upload-sarif', error.message, error.stack);
        return;
    }

    await util.reportActionSucceeded('upload-sarif');
}

run().catch(e => {
    core.setFailed("upload-sarif action failed: " + e);
    console.log(e);
});
