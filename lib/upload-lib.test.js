"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
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
        t.deepEqual(payload.base_ref, "refs/heads/master");
        t.deepEqual(payload.base_sha, "f95f852bd8fca8fcc58a9a2d6c842781e32a215e");
    }
    for (const version of oldVersions) {
        const payload = uploadLib.buildPayload("commit", "refs/pull/123/merge", "key", undefined, "", undefined, "/opt/src", undefined, ["CodeQL", "eslint"], version, "actions");
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
//# sourceMappingURL=upload-lib.test.js.map