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
const path = __importStar(require("path"));
const toolcache = __importStar(require("@actions/tool-cache"));
const util = __importStar(require("./util"));
const nock_1 = __importDefault(require("nock"));
const setupTools = __importStar(require("./setup-tools"));
ava_1.default('download codeql bundle cache', async (t) => {
    await util.withTmpDir(async (tmpDir) => {
        process.env['GITHUB_WORKSPACE'] = tmpDir;
        process.env['RUNNER_TEMP'] = path.join(tmpDir, 'temp');
        process.env['RUNNER_TOOL_CACHE'] = path.join(tmpDir, 'cache');
        const versions = ['20200601', '20200610'];
        for (let i = 0; i < versions.length; i++) {
            const version = versions[i];
            nock_1.default('https://example.com')
                .get(`/download/codeql-bundle-${version}/codeql-bundle.tar.gz`)
                .replyWithFile(200, path.join(__dirname, `/../src/testdata/codeql-bundle.tar.gz`));
            process.env['INPUT_TOOLS'] = `https://example.com/download/codeql-bundle-${version}/codeql-bundle.tar.gz`;
            await setupTools.setupCodeQL();
            t.assert(toolcache.find('CodeQL', `0.0.0-${version}`));
        }
        const cachedVersions = toolcache.findAllVersions('CodeQL');
        t.is(cachedVersions.length, 2);
    });
});
ava_1.default('parse codeql bundle url version', t => {
    const tests = {
        '20200601': '0.0.0-20200601',
        '20200601.0': '0.0.0-20200601.0',
        '20200601.0.0': '20200601.0.0',
        '1.2.3': '1.2.3',
        '1.2.3-alpha': '1.2.3-alpha',
        '1.2.3-beta.1': '1.2.3-beta.1',
    };
    for (const version in tests) {
        const expectedVersion = tests[version];
        const url = `https://github.com/.../codeql-bundle-${version}/...`;
        try {
            const parsedVersion = setupTools.getCodeQLURLVersion(url);
            t.assert(parsedVersion, expectedVersion);
        }
        catch (e) {
            t.fail(e.message);
        }
    }
});
//# sourceMappingURL=setup-tools.test.js.map