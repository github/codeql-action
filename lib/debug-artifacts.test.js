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
const debugArtifacts = __importStar(require("./debug-artifacts"));
(0, ava_1.default)("sanitizeArifactName", (t) => {
    t.deepEqual(debugArtifacts.sanitizeArifactName("hello-world_"), "hello-world_");
    t.deepEqual(debugArtifacts.sanitizeArifactName("hello`world`"), "helloworld");
    t.deepEqual(debugArtifacts.sanitizeArifactName("hello===123"), "hello123");
    t.deepEqual(debugArtifacts.sanitizeArifactName("*m)a&n^y%i££n+v!a:l[i]d"), "manyinvalid");
});
(0, ava_1.default)("uploadDebugArtifacts", async (t) => {
    // Test that no error is thrown if artifacts list is empty.
    await t.notThrowsAsync(debugArtifacts.uploadDebugArtifacts([], "rootDir", "artifactName"));
});
//# sourceMappingURL=debug-artifacts.test.js.map