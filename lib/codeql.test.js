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
const github = __importStar(require("@actions/github"));
const toolcache = __importStar(require("@actions/tool-cache"));
const ava_1 = __importDefault(require("ava"));
const nock_1 = __importDefault(require("nock"));
const path = __importStar(require("path"));
const sinon_1 = __importDefault(require("sinon"));
const api = __importStar(require("./api-client"));
const codeql = __importStar(require("./codeql"));
const defaults = __importStar(require("./defaults.json")); // Referenced from codeql-action-sync-tool!
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
testing_utils_1.setupTests(ava_1.default);
ava_1.default("download and populate codeql bundle cache", async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const versions = ["20200601", "20200610"];
        const languages = [
            [languages_1.Language.cpp],
            [languages_1.Language.cpp, languages_1.Language.python],
        ];
        const platform = process.platform === "win32"
            ? "win64"
            : process.platform === "linux"
                ? "linux64"
                : process.platform === "darwin"
                    ? "osx64"
                    : undefined;
        for (let i = 0; i < versions.length; i++) {
            for (let j = 0; j < languages.length; j++) {
                const version = versions[i];
                const plVersion = languages[j].length === 1
                    ? `${platform}-${languages[j][0]}`
                    : undefined;
                nock_1.default("https://example.com")
                    .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
                    .replyWithFile(200, path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`));
                await codeql.setupCodeQL(`https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`, languages[j], "token", "https://github.example.com", tmpDir, tmpDir, "runner", logging_1.getRunnerLogger(true));
                const toolcacheVersion = plVersion
                    ? `0.0.0-${version}-${plVersion}`
                    : `0.0.0-${version}`;
                t.assert(toolcache.find("CodeQL", toolcacheVersion), `Looking for ${toolcacheVersion}`);
            }
        }
        const cachedVersions = toolcache.findAllVersions("CodeQL");
        // We should now have 4 cached versions: e.g.,
        // 20200601, 20200601-linux64-cpp, 20200610, 20200610-linux64-cpp
        t.is(cachedVersions.length, 4);
    });
});
ava_1.default("download small codeql bundle if analyzing only one language", async (t) => {
    // Note: We do not specify a codeqlURL in this test, thus testing that
    //       the logic for constructing the URL takes into account the
    //       language being analyzed
    await util.withTmpDir(async (tmpDir) => {
        const languages = [
            [languages_1.Language.cpp],
            [languages_1.Language.cpp, languages_1.Language.python],
        ];
        const platform = process.platform === "win32"
            ? "win64"
            : process.platform === "linux"
                ? "linux64"
                : process.platform === "darwin"
                    ? "osx64"
                    : undefined;
        for (let i = 0; i < languages.length; i++) {
            const plVersion = languages[i].length === 1
                ? `${platform}-${languages[i][0]}`
                : undefined;
            const pkg = plVersion
                ? `codeql-bundle-${plVersion}.tar.gz`
                : "codeql-bundle.tar.gz";
            // Mock the API client
            const client = new github.GitHub("123");
            const response = {
                data: {
                    assets: [
                        {
                            name: `codeql-bundle-${platform}-cpp.tar.gz`,
                            url: `https://github.example.com/url/codeql-bundle-${platform}-cpp.tar.gz`,
                        },
                        {
                            name: "codeql-bundle.tar.gz",
                            url: "https://github.example.com/url/codeql-bundle.tar.gz",
                        },
                    ],
                },
            };
            sinon_1.default.stub(client.repos, "getReleaseByTag").resolves(response);
            sinon_1.default.stub(api, "getApiClient").value(() => client);
            nock_1.default("https://github.example.com")
                .get(`/url/${pkg}`)
                .replyWithFile(200, path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`));
            await codeql.setupCodeQL(undefined, languages[i], "token", "https://github.example.com", tmpDir, tmpDir, "runner", logging_1.getRunnerLogger(true));
            const parsedVersion = codeql.getCodeQLURLVersion(`/${defaults.bundleVersion}/`, logging_1.getRunnerLogger(true));
            const toolcacheVersion = plVersion
                ? `${parsedVersion}-${plVersion}`
                : parsedVersion;
            t.assert(toolcache.find("CodeQL", toolcacheVersion), `Looking for ${toolcacheVersion} - ${plVersion}`);
        }
        const cachedVersions = toolcache.findAllVersions("CodeQL");
        t.is(cachedVersions.length, 2);
    });
});
ava_1.default("use full codeql bundle cache if smaller bundle is not available", async (t) => {
    // If we look for a platform-language version but find the full bundle in the cache,
    // we use the full bundle
    await util.withTmpDir(async (tmpDir) => {
        const version = "20200601";
        nock_1.default("https://example.com")
            .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
            .replyWithFile(200, path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`));
        await codeql.setupCodeQL(`https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`, [], "token", "https://github.example.com", tmpDir, tmpDir, "runner", logging_1.getRunnerLogger(true));
        t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
        t.is(toolcache.findAllVersions("CodeQL").length, 1);
        // Now try to request the cpp version, and see that we do not change the cache
        await codeql.setupCodeQL(`https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`, [languages_1.Language.cpp], "token", "https://github.example.com", tmpDir, tmpDir, "runner", logging_1.getRunnerLogger(true));
        t.assert(toolcache.find("CodeQL", `0.0.0-${version}`));
        t.is(toolcache.findAllVersions("CodeQL").length, 1);
    });
});
ava_1.default("use larger bundles if smaller ones are not released", async (t) => {
    // Mock the API client
    const client = new github.GitHub("123");
    const response = {
        data: {
            assets: [{ name: "full-bundle", url: "url/file.gz" }],
        },
    };
    const getReleaseByTagMock = sinon_1.default
        .stub(client.repos, "getReleaseByTag")
        .resolves(response);
    sinon_1.default.stub(api, "getApiClient").value(() => client);
    // Setting this env is required by a dependency of getCodeQLBundleDownloadURL
    process.env["RUNNER_TEMP"] = "abc";
    const codeqlURL = await codeql.getCodeQLBundleDownloadURL(["small-bundle", "full-bundle"], "", "", "actions", logging_1.getRunnerLogger(true));
    t.deepEqual(codeqlURL, "url/file.gz");
    t.assert(getReleaseByTagMock.called);
});
ava_1.default("parse codeql bundle url version", (t) => {
    const tests = {
        "20200601": "0.0.0-20200601",
        "20200601.0": "0.0.0-20200601.0",
        "20200601.0.0": "20200601.0.0",
        "1.2.3": "1.2.3",
        "1.2.3-alpha": "1.2.3-alpha",
        "1.2.3-beta.1": "1.2.3-beta.1",
        "20200601-linux64-python": "0.0.0-20200601-linux64-python",
    };
    for (const [version, expectedVersion] of Object.entries(tests)) {
        const url = `https://github.com/.../codeql-bundle-${version}/...`;
        try {
            const parsedVersion = codeql.getCodeQLURLVersion(url, logging_1.getRunnerLogger(true));
            t.deepEqual(parsedVersion, expectedVersion);
        }
        catch (e) {
            t.fail(e.message);
        }
    }
});
ava_1.default("getExtraOptions works for explicit paths", (t) => {
    t.deepEqual(codeql.getExtraOptions({}, ["foo"], []), []);
    t.deepEqual(codeql.getExtraOptions({ foo: [42] }, ["foo"], []), ["42"]);
    t.deepEqual(codeql.getExtraOptions({ foo: { bar: [42] } }, ["foo", "bar"], []), ["42"]);
});
ava_1.default("getExtraOptions works for wildcards", (t) => {
    t.deepEqual(codeql.getExtraOptions({ "*": [42] }, ["foo"], []), ["42"]);
});
ava_1.default("getExtraOptions works for wildcards and explicit paths", (t) => {
    const o1 = { "*": [42], foo: [87] };
    t.deepEqual(codeql.getExtraOptions(o1, ["foo"], []), ["42", "87"]);
    const o2 = { "*": [42], foo: [87] };
    t.deepEqual(codeql.getExtraOptions(o2, ["foo", "bar"], []), ["42"]);
    const o3 = { "*": [42], foo: { "*": [87], bar: [99] } };
    const p = ["foo", "bar"];
    t.deepEqual(codeql.getExtraOptions(o3, p, []), ["42", "87", "99"]);
});
ava_1.default("getExtraOptions throws for bad content", (t) => {
    t.throws(() => codeql.getExtraOptions({ "*": 42 }, ["foo"], []));
    t.throws(() => codeql.getExtraOptions({ foo: 87 }, ["foo"], []));
    t.throws(() => codeql.getExtraOptions({ "*": [42], foo: { "*": 87, bar: [99] } }, ["foo", "bar"], []));
});
//# sourceMappingURL=codeql.test.js.map