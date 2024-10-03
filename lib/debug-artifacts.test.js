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
const debugArtifacts = __importStar(require("./debug-artifacts"));
const feature_flags_1 = require("./feature-flags");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, ava_1.default)("sanitizeArtifactName", (t) => {
    t.deepEqual(debugArtifacts.sanitizeArtifactName("hello-world_"), "hello-world_");
    t.deepEqual(debugArtifacts.sanitizeArtifactName("hello`world`"), "helloworld");
    t.deepEqual(debugArtifacts.sanitizeArtifactName("hello===123"), "hello123");
    t.deepEqual(debugArtifacts.sanitizeArtifactName("*m)a&n^y%i££n+v!a:l[i]d"), "manyinvalid");
});
(0, ava_1.default)("uploadDebugArtifacts", async (t) => {
    // Test that no error is thrown if artifacts list is empty.
    const logger = (0, logging_1.getActionsLogger)();
    const mockFeature = (0, testing_utils_1.createFeatures)([feature_flags_1.Feature.ArtifactV4Upgrade]);
    await t.notThrowsAsync(debugArtifacts.uploadDebugArtifacts(logger, [], "rootDir", "artifactName", util_1.GitHubVariant.DOTCOM, mockFeature));
});
//# sourceMappingURL=debug-artifacts.test.js.map