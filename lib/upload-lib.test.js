"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
(0, testing_utils_1.setupTests)(ava_1.default);
ava_1.default.beforeEach(() => {
    (0, util_1.initializeEnvironment)("1.2.3");
});
(0, ava_1.default)("validateSarifFileSchema - valid", (t) => {
    const inputFile = `${__dirname}/../src/testdata/valid-sarif.sarif`;
    t.notThrows(() => uploadLib.validateSarifFileSchema(inputFile, (0, logging_1.getRunnerLogger)(true)));
});
(0, ava_1.default)("validateSarifFileSchema - invalid", (t) => {
    const inputFile = `${__dirname}/../src/testdata/invalid-sarif.sarif`;
    t.throws(() => uploadLib.validateSarifFileSchema(inputFile, (0, logging_1.getRunnerLogger)(true)));
});
(0, ava_1.default)("validate correct payload used for push, PR merge commit, and PR head", async (t) => {
    process.env["GITHUB_EVENT_NAME"] = "push";
    const pushPayload = uploadLib.buildPayload("commit", "refs/heads/master", "key", undefined, "", 1234, 1, "/opt/src", undefined, ["CodeQL", "eslint"], "mergeBaseCommit");
    // Not triggered by a pull request
    t.falsy(pushPayload.base_ref);
    t.falsy(pushPayload.base_sha);
    process.env["GITHUB_EVENT_NAME"] = "pull_request";
    process.env["GITHUB_SHA"] = "commit";
    process.env["GITHUB_BASE_REF"] = "master";
    process.env["GITHUB_EVENT_PATH"] =
        `${__dirname}/../src/testdata/pull_request.json`;
    const prMergePayload = uploadLib.buildPayload("commit", "refs/pull/123/merge", "key", undefined, "", 1234, 1, "/opt/src", undefined, ["CodeQL", "eslint"], "mergeBaseCommit");
    // Uploads for a merge commit use the merge base
    t.deepEqual(prMergePayload.base_ref, "refs/heads/master");
    t.deepEqual(prMergePayload.base_sha, "mergeBaseCommit");
    const prHeadPayload = uploadLib.buildPayload("headCommit", "refs/pull/123/head", "key", undefined, "", 1234, 1, "/opt/src", undefined, ["CodeQL", "eslint"], "mergeBaseCommit");
    // Uploads for the head use the PR base
    t.deepEqual(prHeadPayload.base_ref, "refs/heads/master");
    t.deepEqual(prHeadPayload.base_sha, "f95f852bd8fca8fcc58a9a2d6c842781e32a215e");
});
(0, ava_1.default)("finding SARIF files", async (t) => {
    await (0, util_1.withTmpDir)(async (tmpDir) => {
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
(0, ava_1.default)("populateRunAutomationDetails", (t) => {
    let sarif = {
        runs: [{}],
    };
    const analysisKey = ".github/workflows/codeql-analysis.yml:analyze";
    let expectedSarif = {
        runs: [{ automationDetails: { id: "language:javascript/os:linux/" } }],
    };
    // Category has priority over analysis_key/environment
    let modifiedSarif = uploadLib.populateRunAutomationDetails(sarif, "language:javascript/os:linux", analysisKey, '{"language": "other", "os": "other"}');
    t.deepEqual(modifiedSarif, expectedSarif);
    // It doesn't matter if the category has a slash at the end or not
    modifiedSarif = uploadLib.populateRunAutomationDetails(sarif, "language:javascript/os:linux/", analysisKey, "");
    t.deepEqual(modifiedSarif, expectedSarif);
    // check that the automation details doesn't get overwritten
    sarif = { runs: [{ automationDetails: { id: "my_id" } }] };
    expectedSarif = { runs: [{ automationDetails: { id: "my_id" } }] };
    modifiedSarif = uploadLib.populateRunAutomationDetails(sarif, undefined, analysisKey, '{"os": "linux", "language": "javascript"}');
    t.deepEqual(modifiedSarif, expectedSarif);
    // check multiple runs
    sarif = { runs: [{ automationDetails: { id: "my_id" } }, {}] };
    expectedSarif = {
        runs: [
            { automationDetails: { id: "my_id" } },
            {
                automationDetails: {
                    id: ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/",
                },
            },
        ],
    };
    modifiedSarif = uploadLib.populateRunAutomationDetails(sarif, undefined, analysisKey, '{"os": "linux", "language": "javascript"}');
    t.deepEqual(modifiedSarif, expectedSarif);
});
(0, ava_1.default)("validateUniqueCategory when empty", (t) => {
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif()));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif()));
});
(0, ava_1.default)("validateUniqueCategory for automation details id", (t) => {
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("abc")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("abc")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("AbC")));
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("def")));
    // Our category sanitization is not perfect. Here are some examples
    // of where we see false clashes
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("abc/def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("abc@def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("abc_def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("abc def")));
    // this one is fine
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("abc_ def")));
});
(0, ava_1.default)("validateUniqueCategory for tool name", (t) => {
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "abc")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "abc")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "AbC")));
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "def")));
    // Our category sanitization is not perfect. Here are some examples
    // of where we see false clashes
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "abc/def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "abc@def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "abc_def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif(undefined, "abc def")));
    // this one is fine
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("abc_ def")));
});
(0, ava_1.default)("validateUniqueCategory for automation details id and tool name", (t) => {
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("abc", "abc")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("abc", "abc")));
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("abc_", "def")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("abc_", "def")));
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("ghi", "_jkl")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("ghi", "_jkl")));
    // Our category sanitization is not perfect. Here are some examples
    // of where we see false clashes
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("abc")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("abc", "_")));
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("abc", "def__")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("abc_def")));
    t.notThrows(() => uploadLib.validateUniqueCategory(createMockSarif("mno_", "pqr")));
    t.throws(() => uploadLib.validateUniqueCategory(createMockSarif("mno", "_pqr")));
});
(0, ava_1.default)("validateUniqueCategory for multiple runs", (t) => {
    const sarif1 = createMockSarif("abc", "def");
    const sarif2 = createMockSarif("ghi", "jkl");
    // duplicate categories are allowed within the same sarif file
    const multiSarif = { runs: [sarif1.runs[0], sarif1.runs[0], sarif2.runs[0]] };
    t.notThrows(() => uploadLib.validateUniqueCategory(multiSarif));
    // should throw if there are duplicate categories in separate validations
    t.throws(() => uploadLib.validateUniqueCategory(sarif1));
    t.throws(() => uploadLib.validateUniqueCategory(sarif2));
});
(0, ava_1.default)("accept results with invalid artifactLocation.uri value", (t) => {
    const loggedMessages = [];
    const mockLogger = {
        info: (message) => {
            loggedMessages.push(message);
        },
    };
    const sarifFile = `${__dirname}/../src/testdata/with-invalid-uri.sarif`;
    uploadLib.validateSarifFileSchema(sarifFile, mockLogger);
    t.deepEqual(loggedMessages.length, 3);
    t.deepEqual(loggedMessages[1], "Warning: 'not a valid URI' is not a valid URI in 'instance.runs[0].tool.driver.rules[0].helpUri'.", "Warning: 'not a valid URI' is not a valid URI in 'instance.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri'.");
});
(0, ava_1.default)("shouldShowCombineSarifFilesDeprecationWarning when on dotcom", async (t) => {
    t.true(await uploadLib.shouldShowCombineSarifFilesDeprecationWarning([createMockSarif("abc", "def"), createMockSarif("abc", "def")], {
        type: util_1.GitHubVariant.DOTCOM,
    }));
});
(0, ava_1.default)("shouldShowCombineSarifFilesDeprecationWarning when on GHES 3.13", async (t) => {
    t.false(await uploadLib.shouldShowCombineSarifFilesDeprecationWarning([createMockSarif("abc", "def"), createMockSarif("abc", "def")], {
        type: util_1.GitHubVariant.GHES,
        version: "3.13.2",
    }));
});
(0, ava_1.default)("shouldShowCombineSarifFilesDeprecationWarning when on GHES 3.14", async (t) => {
    t.true(await uploadLib.shouldShowCombineSarifFilesDeprecationWarning([createMockSarif("abc", "def"), createMockSarif("abc", "def")], {
        type: util_1.GitHubVariant.GHES,
        version: "3.14.0",
    }));
});
(0, ava_1.default)("shouldShowCombineSarifFilesDeprecationWarning with only 1 run", async (t) => {
    t.false(await uploadLib.shouldShowCombineSarifFilesDeprecationWarning([createMockSarif("abc", "def")], {
        type: util_1.GitHubVariant.DOTCOM,
    }));
});
(0, ava_1.default)("shouldShowCombineSarifFilesDeprecationWarning with distinct categories", async (t) => {
    t.false(await uploadLib.shouldShowCombineSarifFilesDeprecationWarning([createMockSarif("abc", "def"), createMockSarif("def", "def")], {
        type: util_1.GitHubVariant.DOTCOM,
    }));
});
(0, ava_1.default)("shouldShowCombineSarifFilesDeprecationWarning with distinct tools", async (t) => {
    t.false(await uploadLib.shouldShowCombineSarifFilesDeprecationWarning([createMockSarif("abc", "abc"), createMockSarif("abc", "def")], {
        type: util_1.GitHubVariant.DOTCOM,
    }));
});
(0, ava_1.default)("shouldShowCombineSarifFilesDeprecationWarning when environment variable is already set", async (t) => {
    process.env["CODEQL_MERGE_SARIF_DEPRECATION_WARNING"] = "true";
    t.false(await uploadLib.shouldShowCombineSarifFilesDeprecationWarning([createMockSarif("abc", "def"), createMockSarif("abc", "def")], {
        type: util_1.GitHubVariant.DOTCOM,
    }));
});
function createMockSarif(id, tool) {
    return {
        runs: [
            {
                automationDetails: {
                    id,
                },
                tool: {
                    driver: {
                        name: tool,
                    },
                },
            },
        ],
    };
}
//# sourceMappingURL=upload-lib.test.js.map