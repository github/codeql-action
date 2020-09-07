import test from 'ava';
import * as fs from "fs";
import * as path from "path";

import * as externalQueries from "./external-queries";
import { getRunnerLogger } from './logging';
import {setupTests} from './testing-utils';
import * as util from "./util";

setupTests(test);

test("checkoutExternalQueries", async t => {
  await util.withTmpDir(async tmpDir => {
    const ref = "df4c6869212341b601005567381944ed90906b6b";
    await externalQueries.checkoutExternalRepository(
      "github/codeql-go",
      ref,
      'https://github.com',
      tmpDir,
      getRunnerLogger(true));

    // COPYRIGHT file existed in df4c6869212341b601005567381944ed90906b6b but not in the default branch
    t.true(fs.existsSync(path.join(tmpDir, "github", "codeql-go", ref, "COPYRIGHT")));
  });
});
