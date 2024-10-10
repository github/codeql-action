import { IncomingMessage, OutgoingHttpHeaders } from "http";
import * as path from "path";
import { performance } from "perf_hooks";

import * as toolcache from "@actions/tool-cache";
import { https } from "follow-redirects";
import { v4 as uuidV4 } from "uuid";

import { Feature, FeatureEnablement } from "./feature-flags";
import { formatDuration, Logger } from "./logging";
import * as tar from "./tar";
import { cleanUpGlob } from "./util";

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
  compressionMethod: tar.CompressionMethod;
  toolsUrl: string;
  zstdFailureReason?: string;
} & ToolsDownloadDurations;

export async function downloadAndExtract(
  codeqlURL: string,
  authorization: string | undefined,
  headers: OutgoingHttpHeaders,
  tarVersion: tar.TarVersion | undefined,
  tempDir: string,
  features: FeatureEnablement,
  logger: Logger,
): Promise<{
  extractedBundlePath: string;
  statusReport: ToolsDownloadStatusReport;
}> {
  logger.info(
    `Downloading CodeQL tools from ${codeqlURL} . This may take a while.`,
  );

  const compressionMethod = tar.inferCompressionMethod(codeqlURL);

  if (
    compressionMethod === "zstd" &&
    (await features.getValue(Feature.ZstdBundleStreamingExtraction))
  ) {
    logger.info(`Streaming the extraction of the CodeQL bundle.`);

    const toolsInstallStart = performance.now();
    const extractedBundlePath = await downloadAndExtractZstdWithStreaming(
      codeqlURL,
      authorization,
      headers,
      tarVersion!,
      logger,
    );

    const combinedDurationMs = Math.round(
      performance.now() - toolsInstallStart,
    );
    logger.info(
      `Finished downloading and extracting CodeQL bundle to ${extractedBundlePath} (${formatDuration(
        combinedDurationMs,
      )}).`,
    );

    return {
      extractedBundlePath,
      statusReport: {
        compressionMethod,
        toolsUrl: sanitizeUrlForStatusReport(codeqlURL),
        ...makeStreamedToolsDownloadDurations(combinedDurationMs),
      },
    };
  }

  const dest = path.join(tempDir, uuidV4());

  const toolsDownloadStart = performance.now();
  const archivedBundlePath = await toolcache.downloadTool(
    codeqlURL,
    dest,
    authorization,
    headers,
  );
  const downloadDurationMs = Math.round(performance.now() - toolsDownloadStart);

  logger.info(
    `Finished downloading CodeQL bundle to ${archivedBundlePath} (${formatDuration(
      downloadDurationMs,
    )}).`,
  );

  let extractedBundlePath: string;
  let extractionDurationMs: number;

  try {
    logger.info("Extracting CodeQL bundle.");
    const extractionStart = performance.now();
    extractedBundlePath = await tar.extract(
      archivedBundlePath,
      compressionMethod,
      tarVersion,
      logger,
    );
    extractionDurationMs = Math.round(performance.now() - extractionStart);
    logger.info(
      `Finished extracting CodeQL bundle to ${extractedBundlePath} (${formatDuration(
        extractionDurationMs,
      )}).`,
    );
  } finally {
    await cleanUpGlob(archivedBundlePath, "CodeQL bundle archive", logger);
  }

  return {
    extractedBundlePath,
    statusReport: {
      compressionMethod,
      toolsUrl: sanitizeUrlForStatusReport(codeqlURL),
      ...makeDownloadFirstToolsDownloadDurations(
        downloadDurationMs,
        extractionDurationMs,
      ),
    },
  };
}

async function downloadAndExtractZstdWithStreaming(
  codeqlURL: string,
  authorization: string | undefined,
  headers: OutgoingHttpHeaders,
  tarVersion: tar.TarVersion,
  logger: Logger,
): Promise<string> {
  headers = Object.assign(
    { "User-Agent": "CodeQL Action", authorization },
    headers,
  );
  const response = await new Promise<IncomingMessage>((resolve) =>
    https.get(codeqlURL, { headers }, (r) => resolve(r)),
  );

  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to download CodeQL bundle from ${codeqlURL}. HTTP status code: ${response.statusCode}.`,
    );
  }

  return await tar.extractTarZst(response, tarVersion, logger);
}

function sanitizeUrlForStatusReport(url: string): string {
  return ["github/codeql-action", "dsp-testing/codeql-cli-nightlies"].some(
    (repo) => url.startsWith(`https://github.com/${repo}/releases/download/`),
  )
    ? url
    : "sanitized-value";
}
