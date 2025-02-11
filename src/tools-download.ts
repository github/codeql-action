import * as fs from "fs";
import { IncomingMessage, OutgoingHttpHeaders, RequestOptions } from "http";
import * as os from "os";
import * as path from "path";
import { performance } from "perf_hooks";

import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";
import * as toolcache from "@actions/tool-cache";
import { https } from "follow-redirects";
import * as semver from "semver";

import { formatDuration, Logger } from "./logging";
import * as tar from "./tar";
import { cleanUpGlob, getErrorMessage, getRequiredEnvParam } from "./util";

/**
 * High watermark to use when streaming the download and extraction of the CodeQL tools.
 */
export const STREAMING_HIGH_WATERMARK_BYTES = 4 * 1024 * 1024; // 4 MiB

/**
 * The name of the tool cache directory for the CodeQL tools.
 */
const TOOLCACHE_TOOL_NAME = "CodeQL";

/**
 * Timing information for the download and extraction of the CodeQL tools when
 * we fully download the bundle before extracting.
 */
type DownloadFirstToolsDownloadDurations = {
  combinedDurationMs: number;
  downloadDurationMs: number;
  extractionDurationMs: number;
  streamExtraction: false;
};

function makeDownloadFirstToolsDownloadDurations(
  downloadDurationMs: number,
  extractionDurationMs: number,
): DownloadFirstToolsDownloadDurations {
  return {
    combinedDurationMs: downloadDurationMs + extractionDurationMs,
    downloadDurationMs,
    extractionDurationMs,
    streamExtraction: false,
  };
}

/**
 * Timing information for the download and extraction of the CodeQL tools when
 * we stream the download and extraction of the bundle.
 */
type StreamedToolsDownloadDurations = {
  combinedDurationMs: number;
  downloadDurationMs: undefined;
  extractionDurationMs: undefined;
  streamExtraction: true;
};

function makeStreamedToolsDownloadDurations(
  combinedDurationMs: number,
): StreamedToolsDownloadDurations {
  return {
    combinedDurationMs,
    downloadDurationMs: undefined,
    extractionDurationMs: undefined,
    streamExtraction: true,
  };
}

type ToolsDownloadDurations =
  | DownloadFirstToolsDownloadDurations
  | StreamedToolsDownloadDurations;

export type ToolsDownloadStatusReport = {
  cacheDurationMs?: number;
  compressionMethod: tar.CompressionMethod;
  toolsUrl: string;
  zstdFailureReason?: string;
} & ToolsDownloadDurations;

export async function downloadAndExtract(
  codeqlURL: string,
  compressionMethod: tar.CompressionMethod,
  dest: string,
  authorization: string | undefined,
  headers: OutgoingHttpHeaders,
  tarVersion: tar.TarVersion | undefined,
  logger: Logger,
): Promise<ToolsDownloadStatusReport> {
  logger.info(
    `Downloading CodeQL tools from ${codeqlURL} . This may take a while.`,
  );

  try {
    if (compressionMethod === "zstd" && process.platform === "linux") {
      logger.info(`Streaming the extraction of the CodeQL bundle.`);

      const toolsInstallStart = performance.now();
      await downloadAndExtractZstdWithStreaming(
        codeqlURL,
        dest,
        authorization,
        headers,
        tarVersion!,
        logger,
      );

      const combinedDurationMs = Math.round(
        performance.now() - toolsInstallStart,
      );
      logger.info(
        `Finished downloading and extracting CodeQL bundle to ${dest} (${formatDuration(
          combinedDurationMs,
        )}).`,
      );

      return {
        compressionMethod,
        toolsUrl: sanitizeUrlForStatusReport(codeqlURL),
        ...makeStreamedToolsDownloadDurations(combinedDurationMs),
      };
    }
  } catch (e) {
    core.warning(
      `Failed to download and extract CodeQL bundle using streaming with error: ${getErrorMessage(e)}`,
    );
    core.warning(`Falling back to downloading the bundle before extracting.`);

    // If we failed during processing, we want to clean up the destination directory
    // before we try again.
    await cleanUpGlob(dest, "CodeQL bundle", logger);
  }

  const toolsDownloadStart = performance.now();
  const archivedBundlePath = await toolcache.downloadTool(
    codeqlURL,
    undefined,
    authorization,
    headers,
  );
  const downloadDurationMs = Math.round(performance.now() - toolsDownloadStart);

  logger.info(
    `Finished downloading CodeQL bundle to ${archivedBundlePath} (${formatDuration(
      downloadDurationMs,
    )}).`,
  );

  let extractionDurationMs: number;

  try {
    logger.info("Extracting CodeQL bundle.");
    const extractionStart = performance.now();
    await tar.extract(
      archivedBundlePath,
      dest,
      compressionMethod,
      tarVersion,
      logger,
    );
    extractionDurationMs = Math.round(performance.now() - extractionStart);
    logger.info(
      `Finished extracting CodeQL bundle to ${dest} (${formatDuration(
        extractionDurationMs,
      )}).`,
    );
  } finally {
    await cleanUpGlob(archivedBundlePath, "CodeQL bundle archive", logger);
  }

  return {
    compressionMethod,
    toolsUrl: sanitizeUrlForStatusReport(codeqlURL),
    ...makeDownloadFirstToolsDownloadDurations(
      downloadDurationMs,
      extractionDurationMs,
    ),
  };
}

async function downloadAndExtractZstdWithStreaming(
  codeqlURL: string,
  dest: string,
  authorization: string | undefined,
  headers: OutgoingHttpHeaders,
  tarVersion: tar.TarVersion,
  logger: Logger,
): Promise<void> {
  // Ensure destination exists
  fs.mkdirSync(dest, { recursive: true });

  // Get HTTP Agent to use (respects proxy settings).
  const agent = new HttpClient().getAgent(codeqlURL);

  // Add User-Agent header and Authorization header if provided.
  headers = Object.assign(
    { "User-Agent": "CodeQL Action" },
    authorization ? { authorization } : {},
    headers,
  );
  const response = await new Promise<IncomingMessage>((resolve) =>
    https.get(
      codeqlURL,
      {
        headers,
        // Increase the high water mark to improve performance.
        highWaterMark: STREAMING_HIGH_WATERMARK_BYTES,
        // Use the agent to respect proxy settings.
        agent,
      } as unknown as RequestOptions,
      (r) => resolve(r),
    ),
  );

  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to download CodeQL bundle from ${codeqlURL}. HTTP status code: ${response.statusCode}.`,
    );
  }

  await tar.extractTarZst(response, dest, tarVersion, logger);
}

/** Gets the path to the toolcache directory for the specified version of the CodeQL tools. */
export function getToolcacheDirectory(version: string): string {
  return path.join(
    getRequiredEnvParam("RUNNER_TOOL_CACHE"),
    TOOLCACHE_TOOL_NAME,
    semver.clean(version) || version,
    os.arch() || "",
  );
}

export function writeToolcacheMarkerFile(
  extractedPath: string,
  logger: Logger,
): void {
  const markerFilePath = `${extractedPath}.complete`;
  fs.writeFileSync(markerFilePath, "");
  logger.info(`Created toolcache marker file ${markerFilePath}`);
}

function sanitizeUrlForStatusReport(url: string): string {
  return ["github/codeql-action", "dsp-testing/codeql-cli-nightlies"].some(
    (repo) => url.startsWith(`https://github.com/${repo}/releases/download/`),
  )
    ? url
    : "sanitized-value";
}
