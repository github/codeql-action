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
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const uploadLib = __importStar(require("./upload-lib"));
testing_utils_1.setupTests(ava_1.default);
ava_1.default("validateSarifFileSchema - valid", (t) => {
    const inputFile = `${__dirname}/../src/testdata/valid-sarif.sarif`;
    t.notThrows(() => uploadLib.validateSarifFileSchema(inputFile, logging_1.getRunnerLogger(true)));
});
ava_1.default("validateSarifFileSchema - invalid", (t) => {
    const inputFile = `${__dirname}/../src/testdata/invalid-sarif.sarif`;
    t.throws(() => uploadLib.validateSarifFileSchema(inputFile, logging_1.getRunnerLogger(true)));
});
ava_1.default("validate correct payload used per version", async (t) => {
    const newVersions = [
        { type: "dotcom" },
        { type: "ghes", version: "3.1.0" },
    ];
    const oldVersions = [
        { type: "ghes", version: "2.22.1" },
        { type: "ghes", version: "3.0.0" },
    ];
    const allVersions = newVersions.concat(oldVersions);
    process.env["GITHUB_EVENT_NAME"] = "push";
    for (const version of allVersions) {
        const payload = uploadLib.buildPayload("commit", "refs/heads/master", "key", undefined, "", undefined, "/opt/src", undefined, ["CodeQL", "eslint"], version, "actions");
        // Not triggered by a pull request
        t.falsy(payload.base_ref);
        t.falsy(payload.base_sha);
    }
    process.env["GITHUB_EVENT_NAME"] = "pull_request";
    process.env["GITHUB_EVENT_PATH"] = `${__dirname}/../src/testdata/pull_request.json`;
    for (const version of newVersions) {
        const payload = uploadLib.buildPayload("commit", "refs/pull/123/merge", "key", undefined, "", undefined, "/opt/src", undefined, ["CodeQL", "eslint"], version, "actions");
        t.truthy(payload.base_ref);
        t.truthy(payload.base_sha);
    }
    for (const version of oldVersions) {
        const payload = uploadLib.buildPayload("commit", "refs/pull/123/merge", "key", undefined, "", undefined, "/opt/src", undefined, ["CodeQL", "eslint"], version, "actions");
        // These older versions won't expect these values
        t.falsy(payload.base_ref);
        t.falsy(payload.base_sha);
    }
});
//# sourceMappingURL=upload-lib.test.js.map