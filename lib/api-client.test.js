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
const github = __importStar(require("@actions/github"));
const githubUtils = __importStar(require("@actions/github/lib/utils"));
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const api = __importStar(require("./api-client"));
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
ava_1.default.beforeEach(() => {
    util.initializeEnvironment(actionsUtil.getActionVersion());
});
(0, ava_1.default)("getApiClient", async (t) => {
    const pluginStub = sinon.stub(githubUtils.GitHub, "plugin");
    const githubStub = sinon.stub();
    pluginStub.returns(githubStub);
    sinon.stub(actionsUtil, "getRequiredInput").withArgs("token").returns("xyz");
    const requiredEnvParamStub = sinon.stub(util, "getRequiredEnvParam");
    requiredEnvParamStub
        .withArgs("GITHUB_SERVER_URL")
        .returns("http://github.localhost");
    requiredEnvParamStub
        .withArgs("GITHUB_API_URL")
        .returns("http://api.github.localhost");
    api.getApiClient();
    t.assert(githubStub.calledOnceWithExactly({
        auth: "token xyz",
        baseUrl: "http://api.github.localhost",
        log: sinon.match.any,
        userAgent: `CodeQL-Action/${actionsUtil.getActionVersion()}`,
    }));
});
function mockGetMetaVersionHeader(versionHeader) {
    // Passing an auth token is required, so we just use a dummy value
    const client = github.getOctokit("123");
    const response = {
        headers: {
            "x-github-enterprise-version": versionHeader,
        },
    };
    const spyGetContents = sinon
        .stub(client.rest.meta, "get")
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        .resolves(response);
    sinon.stub(api, "getApiClient").value(() => client);
    return spyGetContents;
}
(0, ava_1.default)("getGitHubVersion for Dotcom", async (t) => {
    const apiDetails = {
        auth: "",
        url: "https://github.com",
        apiURL: "",
    };
    sinon.stub(api, "getApiDetails").returns(apiDetails);
    const v = await api.getGitHubVersionFromApi(github.getOctokit("123"), apiDetails);
    t.deepEqual(util.GitHubVariant.DOTCOM, v.type);
});
(0, ava_1.default)("getGitHubVersion for GHES", async (t) => {
    mockGetMetaVersionHeader("2.0");
    const v2 = await api.getGitHubVersionFromApi(api.getApiClient(), {
        auth: "",
        url: "https://ghe.example.com",
        apiURL: undefined,
    });
    t.deepEqual({ type: util.GitHubVariant.GHES, version: "2.0" }, v2);
});
(0, ava_1.default)("getGitHubVersion for different domain", async (t) => {
    mockGetMetaVersionHeader(undefined);
    const v3 = await api.getGitHubVersionFromApi(api.getApiClient(), {
        auth: "",
        url: "https://ghe.example.com",
        apiURL: undefined,
    });
    t.deepEqual({ type: util.GitHubVariant.DOTCOM }, v3);
});
(0, ava_1.default)("getGitHubVersion for GHE_DOTCOM", async (t) => {
    mockGetMetaVersionHeader("ghe.com");
    const gheDotcom = await api.getGitHubVersionFromApi(api.getApiClient(), {
        auth: "",
        url: "https://foo.ghe.com",
        apiURL: undefined,
    });
    t.deepEqual({ type: util.GitHubVariant.GHE_DOTCOM }, gheDotcom);
});
//# sourceMappingURL=api-client.test.js.map