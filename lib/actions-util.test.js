"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const actions_util_1 = require("./actions-util");
const testing_utils_1 = require("./testing-utils");
testing_utils_1.setupTests(ava_1.default);
ava_1.default("getRef() throws on the empty string", (t) => {
    process.env["GITHUB_REF"] = "";
    t.throws(actions_util_1.getRef);
});
ava_1.default("prepareEnvironment() when a local run", (t) => {
    const origLocalRun = process.env.CODEQL_LOCAL_RUN;
    process.env.CODEQL_LOCAL_RUN = "false";
    process.env.GITHUB_JOB = "YYY";
    actions_util_1.prepareLocalRunEnvironment();
    // unchanged
    t.deepEqual(process.env.GITHUB_JOB, "YYY");
    process.env.CODEQL_LOCAL_RUN = "true";
    actions_util_1.prepareLocalRunEnvironment();
    // unchanged
    t.deepEqual(process.env.GITHUB_JOB, "YYY");
    process.env.GITHUB_JOB = "";
    actions_util_1.prepareLocalRunEnvironment();
    // updated
    t.deepEqual(process.env.GITHUB_JOB, "UNKNOWN-JOB");
    process.env.CODEQL_LOCAL_RUN = origLocalRun;
});
//# sourceMappingURL=actions-util.test.js.map