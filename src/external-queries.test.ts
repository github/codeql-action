import * as fs from "fs";
import * as path from "path";

import * as configUtils from "./config-utils";
import * as externalQueries from "./external-queries";

test("checkoutExternalQueries", async () => {
    let config = new configUtils.Config();
    config.externalQueries = [
        new configUtils.ExternalQuery("github/codeql-go", "df4c6869212341b601005567381944ed90906b6b"),
    ];
    await externalQueries.checkoutExternalQueries(config);

    let destination = process.env["RUNNER_WORKSPACE"] || "/tmp/codeql-action/";
    // COPYRIGHT file existed in df4c6869212341b601005567381944ed90906b6b but not in master
    expect(fs.existsSync(path.join(destination, "github", "codeql-go", "COPYRIGHT"))).toBeTruthy();
});
