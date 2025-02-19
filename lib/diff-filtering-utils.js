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
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeDiffRangesJsonFile = writeDiffRangesJsonFile;
exports.readDiffRangesJsonFile = readDiffRangesJsonFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const actionsUtil = __importStar(require("./actions-util"));
function getDiffRangesJsonFilePath() {
    return path.join(actionsUtil.getTemporaryDirectory(), "pr-diff-range.json");
}
function writeDiffRangesJsonFile(logger, ranges) {
    const jsonContents = JSON.stringify(ranges, null, 2);
    const jsonFilePath = getDiffRangesJsonFilePath();
    fs.writeFileSync(jsonFilePath, jsonContents);
    logger.debug(`Wrote pr-diff-range JSON file to ${jsonFilePath}:\n${jsonContents}`);
}
function readDiffRangesJsonFile(logger) {
    const jsonFilePath = getDiffRangesJsonFilePath();
    if (!fs.existsSync(jsonFilePath)) {
        logger.debug(`Diff ranges JSON file does not exist at ${jsonFilePath}`);
        return undefined;
    }
    const jsonContents = fs.readFileSync(jsonFilePath, "utf8");
    logger.debug(`Read pr-diff-range JSON file from ${jsonFilePath}:\n${jsonContents}`);
    return JSON.parse(jsonContents);
}
//# sourceMappingURL=diff-filtering-utils.js.map