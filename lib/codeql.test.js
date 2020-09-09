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
const toolcache = __importStar(require("@actions/tool-cache"));
const ava_1 = __importDefault(require("ava"));
const nock_1 = __importDefault(require("nock"));
const path = __importStar(require("path"));
const codeql = __importStar(require("./codeql"));
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
const languages_1 = require("./languages");
testing_utils_1.setupTests(ava_1.default);
ava_1.default('download codeql bundle cache', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        const versions = ['20200601', '20200610'];
        const languages = [
            [languages_1.Language.cpp],
            [languages_1.Language.cpp, languages_1.Language.python] // Multi-language requires the full bundle
        ];
        const platform = process.platform == 'win32' ? 'win64' :
            process.platform == 'linux' ? 'linux64' :
                process.platform == 'darwin' ? 'osx64' : undefined;
        for (let i = 0; i < versions.length; i++) {
            for (let j = 0; j < languages.length; j++) {
                const version = versions[i];
                const plVersion = (languages[j].length == 1) ? `${platform}-${languages[j][0]}` : undefined;
                const pkg = plVersion ? `codeql-${plVersion}.tar.gz` : `codeql-bundle.tar.gz`;
                nock_1.default('https://example.com')
                    .get(`/download/codeql-bundle-${version}/${pkg}`)
                    .replyWithFile(200, path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`));
                await codeql.setupCodeQL(`https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`, languages[j], 'token', 'https://github.example.com', tmpDir, tmpDir, 'runner', logging_1.getRunnerLogger(true));
                const toolcacheVersion = plVersion ? `0.0.0-${version}-${plVersion}` : `0.0.0-${version}`;
                console.debug(toolcacheVersion);
                t.assert(toolcache.find('CodeQL', toolcacheVersion), `Looking for ${toolcacheVersion} - ${plVersion}`);
            }
        }
        const cachedVersions = toolcache.findAllVersions('CodeQL');
        t.is(cachedVersions.length, 4);
    });
});
ava_1.default('use codeql bundle cache if pl version is not available', async (t) => {
    // If we look for a pl version but find in cache the bundle, we use the bundle
    await util.withTmpDir(async (tmpDir) => {
        const version = '20200601';
        nock_1.default('https://example.com')
            .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
            .replyWithFile(200, path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`));
        await codeql.setupCodeQL(`https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`, [], 'token', 'https://github.example.com', tmpDir, tmpDir, 'runner', logging_1.getRunnerLogger(true));
        t.assert(toolcache.find('CodeQL', `0.0.0-${version}`));
        t.is(toolcache.findAllVersions('CodeQL').length, 1);
        // Now try to request the cpp version, and see that we do not change the cache
        await codeql.setupCodeQL(`https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`, [languages_1.Language.cpp], 'token', 'https://github.example.com', tmpDir, tmpDir, 'runner', logging_1.getRunnerLogger(true));
        t.assert(toolcache.find('CodeQL', `0.0.0-${version}`));
        t.is(toolcache.findAllVersions('CodeQL').length, 1);
    });
});
// test('use larger bundles if smaller ones are unavailble', async t => {
//   // TODO: This should check the fallback behavior of getCodeQLBundleDownloadURL
//    t.fail()
// });
ava_1.default('parse codeql bundle url version', t => {
    const tests = {
        '20200601': '0.0.0-20200601',
        '20200601.0': '0.0.0-20200601.0',
        '20200601.0.0': '20200601.0.0',
        '1.2.3': '1.2.3',
        '1.2.3-alpha': '1.2.3-alpha',
        '1.2.3-beta.1': '1.2.3-beta.1',
        '20200601-linux64-python': '0.0.0-20200601-linux64-python',
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
ava_1.default('getExtraOptions works for explicit paths', t => {
    t.deepEqual(codeql.getExtraOptions({}, ['foo'], []), []);
    t.deepEqual(codeql.getExtraOptions({ foo: [42] }, ['foo'], []), ['42']);
    t.deepEqual(codeql.getExtraOptions({ foo: { bar: [42] } }, ['foo', 'bar'], []), ['42']);
});
ava_1.default('getExtraOptions works for wildcards', t => {
    t.deepEqual(codeql.getExtraOptions({ '*': [42] }, ['foo'], []), ['42']);
});
ava_1.default('getExtraOptions works for wildcards and explicit paths', t => {
    let o1 = { '*': [42], foo: [87] };
    t.deepEqual(codeql.getExtraOptions(o1, ['foo'], []), ['42', '87']);
    let o2 = { '*': [42], foo: [87] };
    t.deepEqual(codeql.getExtraOptions(o2, ['foo', 'bar'], []), ['42']);
    let o3 = { '*': [42], foo: { '*': [87], bar: [99] } };
    let p = ['foo', 'bar'];
    t.deepEqual(codeql.getExtraOptions(o3, p, []), ['42', '87', '99']);
});
ava_1.default('getExtraOptions throws for bad content', t => {
    t.throws(() => codeql.getExtraOptions({ '*': 42 }, ['foo'], []));
    t.throws(() => codeql.getExtraOptions({ foo: 87 }, ['foo'], []));
    t.throws(() => codeql.getExtraOptions({ '*': [42], foo: { '*': 87, bar: [99] } }, ['foo', 'bar'], []));
});
//# sourceMappingURL=codeql.test.js.map