"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const uploadLib = __importStar(require("./upload-lib"));
const util_1 = require("./util");
testing_utils_1.setupTests(ava_1.default);
ava_1.default.beforeEach(() => {
    util_1.initializeEnvironment(util_1.Mode.actions, "1.2.3");
});
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
        { type: util_1.GitHubVariant.DOTCOM },
        { type: util_1.GitHubVariant.GHES, version: "3.1.0" },
    ];
    const oldVersions = [
        { type: util_1.GitHubVariant.GHES, version: "2.22.1" },
        { type: util_1.GitHubVariant.GHES, version: "3.0.0" },
    ];
    const allVersions = newVersions.concat(oldVersions);
    process.env["GITHUB_EVENT_NAME"] = "push";
    for (const version of allVersions) {
        const payload = uploadLib.buildPayload("commit", "refs/heads/master", "key", undefined, "", undefined, "/opt/src", undefined, ["CodeQL", "eslint"], version);
        // Not triggered by a pull request
        t.falsy(payload.base_ref);
        t.falsy(payload.base_sha);
    }
    process.env["GITHUB_EVENT_NAME"] = "pull_request";
    process.env["GITHUB_EVENT_PATH"] = `${__dirname}/../src/testdata/pull_request.json`;
    for (const version of newVersions) {
        const payload = uploadLib.buildPayload("commit", "refs/pull/123/merge", "key", undefined, "", undefined, "/opt/src", undefined, ["CodeQL", "eslint"], version);
        t.deepEqual(payload.base_ref, "refs/heads/master");
        t.deepEqual(payload.base_sha, "f95f852bd8fca8fcc58a9a2d6c842781e32a215e");
    }
    for (const version of oldVersions) {
        const payload = uploadLib.buildPayload("commit", "refs/pull/123/merge", "key", undefined, "", undefined, "/opt/src", undefined, ["CodeQL", "eslint"], version);
        // These older versions won't expect these values
        t.falsy(payload.base_ref);
        t.falsy(payload.base_sha);
    }
});
ava_1.default("finding SARIF files", async (t) => {
    await util_1.withTmpDir(async (tmpDir) => {
        // include a couple of sarif files
        fs.writeFileSync(path.join(tmpDir, "a.sarif"), "");
        fs.writeFileSync(path.join(tmpDir, "b.sarif"), "");
        // other random files shouldn't be returned
        fs.writeFileSync(path.join(tmpDir, "c.foo"), "");
        // we should recursively look in subdirectories
        fs.mkdirSync(path.join(tmpDir, "dir1"));
        fs.writeFileSync(path.join(tmpDir, "dir1", "d.sarif"), "");
        fs.mkdirSync(path.join(tmpDir, "dir1", "dir2"));
        fs.writeFileSync(path.join(tmpDir, "dir1", "dir2", "e.sarif"), "");
        // we should ignore symlinks
        fs.mkdirSync(path.join(tmpDir, "dir3"));
        fs.symlinkSync(tmpDir, path.join(tmpDir, "dir3", "symlink1"), "dir");
        fs.symlinkSync(path.join(tmpDir, "a.sarif"), path.join(tmpDir, "dir3", "symlink2.sarif"), "file");
        const sarifFiles = uploadLib.findSarifFilesInDir(tmpDir);
        t.deepEqual(sarifFiles, [
            path.join(tmpDir, "a.sarif"),
            path.join(tmpDir, "b.sarif"),
            path.join(tmpDir, "dir1", "d.sarif"),
            path.join(tmpDir, "dir1", "dir2", "e.sarif"),
        ]);
    });
});
ava_1.default("populateRunAutomationDetails", (t) => {
    let sarif = '{"runs": [{}]}';
    const analysisKey = ".github/workflows/codeql-analysis.yml:analyze";
    let expectedSarif = '{"runs":[{"automationDetails":{"id":"language:javascript/os:linux/"}}]}';
    // Category has priority over analysis_key/environment
    let modifiedSarif = uploadLib.populateRunAutomationDetails(sarif, "language:javascript/os:linux", analysisKey, '{"language": "other", "os": "other"}');
    t.deepEqual(modifiedSarif, expectedSarif);
    // It doesn't matter if the category has a slash at the end or not
    modifiedSarif = uploadLib.populateRunAutomationDetails(sarif, "language:javascript/os:linux/", analysisKey, "");
    t.deepEqual(modifiedSarif, expectedSarif);
    // check that the automation details doesn't get overwritten
    sarif = '{"runs":[{"automationDetails":{"id":"my_id"}}]}';
    expectedSarif = '{"runs":[{"automationDetails":{"id":"my_id"}}]}';
    modifiedSarif = uploadLib.populateRunAutomationDetails(sarif, undefined, analysisKey, '{"os": "linux", "language": "javascript"}');
    t.deepEqual(modifiedSarif, expectedSarif);
});
//# sourceMappingURL=upload-lib.test.js.map