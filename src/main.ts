import * as core from '@actions/core';

import * as analyze from './finalize-db';
import * as autobuild from './autobuild';
import * as init from './setup-tracer';
import * as upload_sarif from './upload-sarif';

export function runAnalyze() {
  analyze.run().catch(e => {
    core.setFailed("analyze action failed.  " + e);
    console.log(e);
  });
}

export function runAutobuild() {
  autobuild.run().catch(e => {
    core.setFailed("autobuild action failed.  " + e);
    console.log(e);
  });
}

export function runInit() {
  init.run().catch(e => {
    core.setFailed("init action failed.  " + e);
    console.log(e);
  });
}

export function runUploadSarif() {
  upload_sarif.run().catch(e => {
    core.setFailed("upload_sarif action failed.  " + e);
    console.log(e);
  });
}
