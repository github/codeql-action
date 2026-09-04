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
import { cleanUpPath, getErrorMessage, getRequiredEnvParam } from "./util";

/**
 * High watermark to use when streaming the download and extraction of the CodeQL tools.
 */
const STREAMING_HIGH_WATERMARK_BYTES = 4 * 1024 * 1024; // 4 MiB

/**
 * How long the streaming download of the CodeQL tools may stall for before we abort it. This
 * applies both to establishing the connection and to gaps between chunks of the response body.
 */
const STREAMING_STALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * The name of the tool cache directory for the CodeQL tools.
 */
const TOOLCACHE_TOOL_NAME = "CodeQL";

export type ToolsDownloadStatusReport = {
  /**
   * Time spent downloading the bundle, in milliseconds. Not populated when the bundle is downloaded
   * and extracted concurrently, since the two cannot be told apart.
   */
  downloadDurationMs?: number;
  /**
   * Time spent extracting the bundle, in milliseconds. Not populated when the bundle is downloaded
   * and extracted concurrently, since the two cannot be told apart.
   */
  extractionDurationMs?: number;
  /**
   * Total time taken to make the bundle available on disk, in milliseconds. This includes any time
   * spent on a streaming attempt that failed and fell back to downloading before extracting.
   */
  totalDurationMs: number;
};

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

  const startTime = performance.now();

  try {
    if (compressionMethod === "zstd" && process.platform === "linux") {
      logger.info(`Streaming the extraction of the CodeQL bundle.`);

      await downloadAndExtractZstdWithStreaming(
        codeqlURL,
        dest,
        authorization,
        headers,
        tarVersion!,
        logger,
      );

      const totalDurationMs = Math.round(performance.now() - startTime);
      logger.info(
        `Finished downloading and extracting CodeQL bundle to ${dest} (${formatDuration(
          totalDurationMs,
        )}).`,
      );

      return { totalDurationMs };
    }
  } catch (e) {
    core.warning(
      `Failed to download and extract CodeQL bundle using streaming with error: ${getErrorMessage(e)}`,
    );
    core.warning(`Falling back to downloading the bundle before extracting.`);

    // If we failed during processing, we want to clean up the destination directory
    // before we try again.
    await cleanUpPath(dest, "CodeQL bundle", logger);
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

  let extractionDurationMs: number | undefined;

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
    await cleanUpPath(archivedBundlePath, "CodeQL bundle archive", logger);
  }

  return {
    downloadDurationMs,
    extractionDurationMs,
    totalDurationMs: Math.round(performance.now() - startTime),
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
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = https.get(
      codeqlURL,
      {
        headers,
        // Increase the high water mark to improve performance.
        highWaterMark: STREAMING_HIGH_WATERMARK_BYTES,
        // Use the agent to respect proxy settings.
        agent,
      } as unknown as RequestOptions,
      (r) => resolve(r),
    );
    // Without this listener, connection failures such as `ECONNRESET` are emitted as unhandled
    // `error` events, which terminate the process instead of letting us fall back to downloading
    // the bundle before extracting it. This listener stays attached after the response arrives, so
    // it also handles errors that occur while the response is being streamed.
    request.on("error", reject);
    request.setTimeout(STREAMING_STALL_TIMEOUT_MS, () => {
      request.destroy(
        new Error(
          `No data received for ${formatDuration(STREAMING_STALL_TIMEOUT_MS)}.`,
        ),
      );
    });
  });

  if (response.statusCode !== 200) {
    // Discard the response body so that the connection can be released.
    response.resume();
    throw new Error(
      `Failed to download CodeQL bundle from ${codeqlURL}. HTTP status code: ${response.statusCode}.`,
    );
  }

  await tar.extractTarZst(response, dest, tarVersion, logger);
}

/** Gets the path to the toolcache directory that holds all versions of the CodeQL tools. */
function getToolcacheToolDirectory(): string {
  return path.join(
    getRequiredEnvParam("RUNNER_TOOL_CACHE"),
    TOOLCACHE_TOOL_NAME,
  );
}

/** Gets the name of the toolcache directory that holds the given version of the CodeQL tools. */
function getToolcacheVersionDirectoryName(version: string): string {
  return semver.clean(version) || version;
}

/** Gets the path to the toolcache directory for the specified version of the CodeQL tools. */
export function getToolcacheDirectory(version: string): string {
  return path.join(
    getToolcacheToolDirectory(),
    getToolcacheVersionDirectoryName(version),
    os.arch() || "",
  );
}

/**
 * Whether the toolcache is on the same filesystem as the workspace, and so whether deleting the
 * tools frees up disk space that the analysis can use.
 *
 * These are separate volumes on some runner images. Windows runners, for example, keep the
 * toolcache on `C:` while the workspace is on `D:`.
 */
export function isToolcacheOnWorkspaceFilesystem(logger: Logger): boolean {
  try {
    return (
      fs.statSync(getRequiredEnvParam("RUNNER_TOOL_CACHE")).dev ===
      fs.statSync(getRequiredEnvParam("GITHUB_WORKSPACE")).dev
    );
  } catch (e) {
    logger.debug(
      `Could not determine whether the toolcache is on the same filesystem as the workspace: ${getErrorMessage(e)}`,
    );
    return false;
  }
}

/** The outcome of trying to reclaim disk space by deleting the CodeQL tools from the toolcache. */
export interface ToolcacheCleanupResult {
  /** The versions of the CodeQL tools that were deleted. */
  deletedVersions: string[];
  /**
   * Whether we hit an error while trying to delete the tools. Distinguishes a toolcache that had
   * nothing to reclaim from one we failed to clean up.
   */
  failed: boolean;
}

/**
 * Deletes every version of the CodeQL tools from the toolcache.
 *
 * Only safe to call when we are about to download the tools, since that means we did not resolve
 * them from the toolcache and so nothing in there is in use by this job.
 *
 * This only ever touches the CodeQL directory of the toolcache, and is best-effort: any failure is
 * logged rather than propagated, since the caller can proceed without the disk space.
 *
 * @returns the versions that were deleted, and whether we hit an error while trying.
 */
export async function deleteToolcacheBundles(
  logger: Logger,
): Promise<ToolcacheCleanupResult> {
  let toolDirectory: string;

  try {
    toolDirectory = getToolcacheToolDirectory();
  } catch (e) {
    logger.info(
      `Unable to reclaim disk space from the toolcache: ${getErrorMessage(e)}`,
    );
    return { deletedVersions: [], failed: true };
  }

  try {
    // Refuse to follow a symlinked CodeQL directory, so that we can only ever delete paths that are
    // really inside the toolcache.
    if ((await fs.promises.lstat(toolDirectory)).isSymbolicLink()) {
      logger.info(
        `Not deleting the CodeQL tools from the toolcache since '${toolDirectory}' is a symlink.`,
      );
      return { deletedVersions: [], failed: true };
    }
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      logger.debug(
        `There are no CodeQL tools at '${toolDirectory}' to delete from the toolcache.`,
      );
      return { deletedVersions: [], failed: false };
    }
    logger.info(
      `Failed to inspect the CodeQL tools at '${toolDirectory}': ${getErrorMessage(e)}`,
    );
    return { deletedVersions: [], failed: true };
  }

  try {
    const entries = await fs.promises.readdir(toolDirectory, {
      withFileTypes: true,
    });

    const deletedVersions: string[] = [];
    let failed = false;

    for (const entry of entries) {
      const versionDirectory = path.join(toolDirectory, entry.name);

      // `isDirectory` is false for a symlink, so we never delete a version directory that is
      // really somewhere else.
      if (!entry.isDirectory()) {
        logger.debug(
          `Not deleting '${versionDirectory}' from the toolcache since it is not a directory.`,
        );
        continue;
      }

      try {
        await fs.promises.rm(versionDirectory, {
          force: true,
          recursive: true,
        });
        deletedVersions.push(entry.name);
        logger.info(
          `Deleted the CodeQL tools at '${versionDirectory}' from the toolcache to free up disk space.`,
        );
      } catch (e) {
        failed = true;
        logger.info(
          `Failed to delete the CodeQL tools at '${versionDirectory}' from the toolcache: ${getErrorMessage(e)}`,
        );
      }
    }

    return { deletedVersions: deletedVersions.sort(), failed };
  } catch (e) {
    logger.info(
      `Failed to read the CodeQL tools at '${toolDirectory}' from the toolcache: ${getErrorMessage(e)}`,
    );
    return { deletedVersions: [], failed: true };
  }
}

export function writeToolcacheMarkerFile(
  extractedPath: string,
  logger: Logger,
): void {
  const markerFilePath = `${extractedPath}.complete`;
  fs.writeFileSync(markerFilePath, "");
  logger.info(`Created toolcache marker file ${markerFilePath}`);
}
