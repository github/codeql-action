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
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const actionsUtil = __importStar(require("./actions-util"));
async function run(uploadDebugArtifacts) {
    const tempDir = actionsUtil.getTemporaryDirectory();
    // Upload Actions SARIF artifacts for debugging
    if (core.isDebug() &&
        process.env["CODEQL_ACTION_DEBUG_COMBINED_SARIF"] === "true") {
        core.info("Debug mode is on. Uploading available combined SARIF files as Actions debugging artifact...");
        const baseTempDir = path.resolve(tempDir, "combined-sarif");
        const toUpload = [];
        if (fs.existsSync(baseTempDir)) {
            const outputDirs = fs.readdirSync(baseTempDir);
            for (const outputDir of outputDirs) {
                const sarifFiles = fs
                    .readdirSync(path.resolve(baseTempDir, outputDir))
                    .filter((f) => f.endsWith(".sarif"));
                for (const sarifFile of sarifFiles) {
                    toUpload.push(path.resolve(baseTempDir, outputDir, sarifFile));
                }
            }
        }
        if (toUpload.length > 0) {
            await uploadDebugArtifacts(toUpload, baseTempDir, "upload-debug-artifacts");
        }
    }
}
exports.run = run;
//# sourceMappingURL=upload-sarif-action-post-helper.js.map