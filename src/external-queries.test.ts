import test from 'ava';
import * as fs from "fs";
import * as path from "path";

import * as externalQueries from "./external-queries";
import {setupTests} from './testing-utils';
import * as util from "./util";

setupTests(test);

test("checkoutExternalQueries", async t => {
  await util.withTmpDir(async tmpDir => {
    await externalQueries.checkoutExternalRepository(
      "github/codeql-go",
      "df4c6869212341b601005567381944ed90906b6b",
      tmpDir);

    // COPYRIGHT file existed in df4c6869212341b601005567381944ed90906b6b but not in the default branch
    t.true(fs.existsSync(path.join(tmpDir, "github", "codeql-go", "COPYRIGHT")));
  });
});
