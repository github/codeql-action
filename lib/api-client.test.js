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
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const api_client_1 = require("./api-client");
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
(0, testing_utils_1.setupTests)(ava_1.default);
let pluginStub;
let githubStub;
ava_1.default.beforeEach(() => {
    pluginStub = sinon.stub(githubUtils.GitHub, "plugin");
    githubStub = sinon.stub();
    pluginStub.returns(githubStub);
    util.initializeEnvironment(pkg.version);
});
(0, ava_1.default)("getApiClient", async (t) => {
    sinon.stub(actionsUtil, "getRequiredInput").withArgs("token").returns("xyz");
    const requiredEnvParamStub = sinon.stub(util, "getRequiredEnvParam");
    requiredEnvParamStub
        .withArgs("GITHUB_SERVER_URL")
        .returns("http://github.localhost");
    requiredEnvParamStub
        .withArgs("GITHUB_API_URL")
        .returns("http://api.github.localhost");
    (0, api_client_1.getApiClient)();
    t.assert(githubStub.calledOnceWithExactly({
        auth: "token xyz",
        baseUrl: "http://api.github.localhost",
        log: sinon.match.any,
        userAgent: `CodeQL-Action/${pkg.version}`,
    }));
});
//# sourceMappingURL=api-client.test.js.map