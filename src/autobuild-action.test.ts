import test from "ava";
import * as sinon from "sinon";

import { runWrapper } from "./autobuild-action";
import * as configUtils from "./config-utils";
import { EnvVar } from "./environment";
import { setupActionsVars, setupTests } from "./testing-utils";
import * as util from "./util";

setupTests(test);

test.serial(
  "autobuild is skipped when init intentionally skips analysis",
  async (t) => {
    await util.withTmpDir(async (tmpDir) => {
      setupActionsVars(tmpDir, tmpDir);
      process.env[EnvVar.ANALYSIS_SKIP_REASON] = "draft pull request";

      try {
        const getConfigStub = sinon.stub(configUtils, "getConfig");

        await runWrapper();

        t.false(getConfigStub.called);
        t.is(process.env[EnvVar.AUTOBUILD_DID_COMPLETE_SUCCESSFULLY], "true");
      } finally {
        delete process.env[EnvVar.ANALYSIS_SKIP_REASON];
        delete process.env[EnvVar.AUTOBUILD_DID_COMPLETE_SUCCESSFULLY];
      }
    });
  },
);
