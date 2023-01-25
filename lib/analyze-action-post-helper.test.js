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
const ava_1 = __importDefault(require("ava"));
const sinon = __importStar(require("sinon"));
const actionsUtil = __importStar(require("./actions-util"));
const analyzeActionPostHelper = __importStar(require("./analyze-action-post-helper"));
const configUtils = __importStar(require("./config-utils"));
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("post: analyze action with debug mode off", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env["RUNNER_TEMP"] = tmpDir;
        const gitHubVersion = {
            type: util.GitHubVariant.DOTCOM,
        };
        sinon.stub(configUtils, "getConfig").resolves({
            debugMode: false,
            gitHubVersion,
            languages: [],
            packs: [],
        });
        const uploadSarifSpy = sinon.spy();
        await analyzeActionPostHelper.run(uploadSarifSpy);
        t.assert(uploadSarifSpy.notCalled);
    });
});
(0, ava_1.default)("post: analyze action with debug mode on", async (t) => {
    return await util.withTmpDir(async (tmpDir) => {
        process.env["RUNNER_TEMP"] = tmpDir;
        const gitHubVersion = {
            type: util.GitHubVariant.DOTCOM,
        };
        sinon.stub(configUtils, "getConfig").resolves({
            debugMode: true,
            gitHubVersion,
            languages: [],
            packs: [],
        });
        const requiredInputStub = sinon.stub(actionsUtil, "getRequiredInput");
        requiredInputStub.withArgs("output").returns("fake-output-dir");
        const uploadSarifSpy = sinon.spy();
        await analyzeActionPostHelper.run(uploadSarifSpy);
        t.assert(uploadSarifSpy.called);
    });
});
//# sourceMappingURL=analyze-action-post-helper.test.js.map