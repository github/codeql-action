import * as core from '@actions/core';

import * as upload_lib from './upload-lib';
import * as util from './util';

async function run() {
    if (util.should_abort('upload-sarif', false) || !await util.reportActionStarting('upload-sarif')) {
        return;
    }

    try {
        if (await upload_lib.upload(core.getInput('sarif_file'))) {
            await util.reportActionSucceeded('upload-sarif');
        } else {
            await util.reportActionFailed('upload-sarif', 'upload');
        }
    } catch (error) {
        core.setFailed(error.message);
        await util.reportActionFailed('upload-sarif', error.message, error.stack);
        return;
    }
}

run().catch(e => {
    core.setFailed("codeql/upload-sarif action failed: " + e);
    console.log(e);
});
