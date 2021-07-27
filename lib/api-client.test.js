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
const githubUtils = __importStar(require("@actions/github/lib/utils"));
const ava_1 = __importDefault(require("ava"));
const sinon_1 = __importDefault(require("sinon"));
const api_client_1 = require("./api-client");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
testing_utils_1.setupTests(ava_1.default);
let pluginStub;
let githubStub;
ava_1.default.beforeEach(() => {
    pluginStub = sinon_1.default.stub(githubUtils.GitHub, "plugin");
    githubStub = sinon_1.default.stub();
    pluginStub.returns(githubStub);
    util_1.initializeEnvironment(util_1.Mode.actions, pkg.version);
});
ava_1.default("Get the client API", async (t) => {
    doTest(t, {
        auth: "xyz",
        externalRepoAuth: "abc",
        url: "http://hucairz",
    }, undefined, {
        auth: "token xyz",
        baseUrl: "http://hucairz/api/v3",
        userAgent: `CodeQL-Action/${pkg.version}`,
    });
});
ava_1.default("Get the client API external", async (t) => {
    doTest(t, {
        auth: "xyz",
        externalRepoAuth: "abc",
        url: "http://hucairz",
    }, { allowExternal: true }, {
        auth: "token abc",
        baseUrl: "http://hucairz/api/v3",
        userAgent: `CodeQL-Action/${pkg.version}`,
    });
});
ava_1.default("Get the client API external not present", async (t) => {
    doTest(t, {
        auth: "xyz",
        url: "http://hucairz",
    }, { allowExternal: true }, {
        auth: "token xyz",
        baseUrl: "http://hucairz/api/v3",
        userAgent: `CodeQL-Action/${pkg.version}`,
    });
});
ava_1.default("Get the client API with github url", async (t) => {
    doTest(t, {
        auth: "xyz",
        url: "https://github.com/some/invalid/url",
    }, undefined, {
        auth: "token xyz",
        baseUrl: "https://api.github.com",
        userAgent: `CodeQL-Action/${pkg.version}`,
    });
});
function doTest(t, clientArgs, clientOptions, expected) {
    api_client_1.getApiClient(clientArgs, clientOptions);
    const firstCallArgs = githubStub.args[0];
    // log is a function, so we don't need to test for equality of it
    delete firstCallArgs[0].log;
    t.deepEqual(firstCallArgs, [expected]);
}
//# sourceMappingURL=api-client.test.js.map