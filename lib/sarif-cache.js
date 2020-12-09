"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cache = __importStar(require("@actions/cache"));
const CACHE_KEY = "cheating-static-key"; // TODO
async function getSARIFCachePath() {
    const runnerTemp = process.env.RUNNER_TEMP;
    if (runnerTemp === undefined) {
        return undefined;
    }
    return path.join(runnerTemp, "codeql-results-cache");
}
async function saveSARIFResults(outputPath) {
    const sarifCachePath = await getSARIFCachePath();
    if (sarifCachePath === undefined) {
        return;
    }
    if (!await fs.existsSync(sarifCachePath)) {
        await fs.promises.mkdir(sarifCachePath);
    }
    let outputSARIFNames = await fs.promises.readdir(outputPath);
    for (let outputSARIFName of outputSARIFNames) {
        let outputSARIFPath = path.join(outputPath, outputSARIFName);
        let cachedSARIFPath = path.join(sarifCachePath, path.relative(outputPath, outputSARIFPath));
        await fs.promises.copyFile(outputSARIFPath, cachedSARIFPath);
    }
    await cache.saveCache([sarifCachePath], CACHE_KEY);
}
exports.saveSARIFResults = saveSARIFResults;
async function skipAnalysis() {
    const sarifCachePath = await getSARIFCachePath();
    if (sarifCachePath === undefined) {
        return false;
    }
    let cachedSARIFPaths = await fs.promises.readdir(sarifCachePath);
    return cachedSARIFPaths.length > 0; // TODO
}
exports.skipAnalysis = skipAnalysis;
async function restoreSARIFResults() {
    const sarifCachePath = await getSARIFCachePath();
    if (sarifCachePath === undefined) {
        return;
    }
    await fs.promises.mkdir(sarifCachePath);
    await cache.restoreCache([sarifCachePath], CACHE_KEY);
}
exports.restoreSARIFResults = restoreSARIFResults;
async function copySARIFResults(outputPath) {
    const sarifCachePath = await getSARIFCachePath();
    if (sarifCachePath === undefined) {
        return;
    }
    let cachedSARIFNames = await fs.promises.readdir(sarifCachePath);
    for (let cachedSARIFName of cachedSARIFNames) {
        let cachedSARIFPath = path.join(sarifCachePath, cachedSARIFName);
        let outputSARIFPath = path.join(outputPath, path.relative(sarifCachePath, cachedSARIFPath));
        await fs.promises.copyFile(cachedSARIFPath, outputSARIFPath);
    }
}
exports.copySARIFResults = copySARIFResults;
//# sourceMappingURL=sarif-cache.js.map