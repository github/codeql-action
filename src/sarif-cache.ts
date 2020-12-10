import * as fs from "fs";
import * as path from "path";

import * as cache from "@actions/cache";

const CACHE_KEY = "cheating-static-key"; // TODO

async function getSARIFCachePath(): Promise<string | undefined> {
  const runnerTemp = process.env.RUNNER_TEMP;
  if (runnerTemp === undefined) {
    return undefined;
  }
  return path.join(runnerTemp, "codeql-results-cache");
}

export async function saveSARIFResults(outputPath: string) {
  const sarifCachePath = await getSARIFCachePath()
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

export async function skipAnalysis(): Promise<boolean> {
  const sarifCachePath = await getSARIFCachePath()
  if (sarifCachePath === undefined) {
    return false;
  }

  let cachedSARIFPaths = await fs.promises.readdir(sarifCachePath);
  return cachedSARIFPaths.length > 0; // TODO
}

export async function restoreSARIFResults() {
  const sarifCachePath = await getSARIFCachePath()
  if (sarifCachePath === undefined) {
    return;
  }

  await fs.promises.mkdir(sarifCachePath);
  await cache.restoreCache([sarifCachePath], CACHE_KEY);
}

export async function copySARIFResults(outputPath: string) {
  const sarifCachePath = await getSARIFCachePath()
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
