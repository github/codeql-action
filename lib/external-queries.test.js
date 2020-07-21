"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const configUtils = __importStar(require("./config-utils"));
const externalQueries = __importStar(require("./external-queries"));
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
testing_utils_1.setupTests(ava_1.default);
ava_1.default("checkoutExternalQueries", async (t) => {
    let config = new configUtils.Config();
    config.externalQueries = [
        new configUtils.ExternalQuery("github/codeql-go", "df4c6869212341b601005567381944ed90906b6b"),
    ];
    await util.withTmpDir(async (tmpDir) => {
        process.env["RUNNER_TEMP"] = tmpDir;
        await externalQueries.checkoutExternalQueries(config);
        // COPYRIGHT file existed in df4c6869212341b601005567381944ed90906b6b but not in master
        t.true(fs.existsSync(path.join(tmpDir, "github", "codeql-go", "COPYRIGHT")));
    });
});
//# sourceMappingURL=external-queries.test.js.map