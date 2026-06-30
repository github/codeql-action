import * as fs from "fs";

import * as actionsUtil from "./actions-util";
import { AnalysisKind } from "./analyses";
import {
  DO_NOT_RETRY_STATUSES,
  getApiClient,
  GitHubApiDetails,
} from "./api-client";
import { type CodeQL } from "./codeql";
import { Config } from "./config-utils";
import { Feature, FeatureEnablement } from "./feature-flags";
import * as gitUtils from "./git-utils";
import { Logger, withGroupAsync } from "./logging";
import { OverlayDatabaseMode } from "./overlay/overlay-database-mode";
import { RepositoryNwo } from "./repository";
import * as util from "./util";
import { asHTTPError, bundleDb, CleanupLevel, parseGitHubUrl } from "./util";

/** Information about a database upload. */
export interface DatabaseUploadResult {
  /** Language of the database. */
  language: string;
  /** Size of the zipped database in bytes. */
  zipped_upload_size_bytes?: number;
  /** Whether the uploaded database is an overlay base. */
  is_overlay_base?: boolean;
  /**
   * For overlay-base uploads only: the size in bytes that the zipped database
   * would have been if it had been cleaned at the `clear` cleanup level instead
   * of the `overlay` level.
   */
  clear_cleanup_zipped_size_bytes?: number;
  /**
   * For overlay-base uploads only: the time in milliseconds spent measuring the
   * `clear` cleanup size (cleaning up the cluster at the `clear` level and
   * bundling each database). This is a cluster-wide measurement, so it is the
   * same for every language in a run.
   */
  clear_cleanup_measurement_duration_ms?: number;
  /** Time taken to upload database in milliseconds. */
  upload_duration_ms?: number;
  /** If there was an error during database upload, this is its message. */
  error?: string;
}

export async function cleanupAndUploadDatabases(
  repositoryNwo: RepositoryNwo,
  codeql: CodeQL,
  config: Config,
  apiDetails: GitHubApiDetails,
  features: FeatureEnablement,
  logger: Logger,
): Promise<DatabaseUploadResult[]> {
  if (actionsUtil.getRequiredInput("upload-database") !== "true") {
    logger.debug("Database upload disabled in workflow. Skipping upload.");
    return [];
  }

  if (!config.analysisKinds.includes(AnalysisKind.CodeScanning)) {
    logger.debug(
      `Not uploading database because 'analysis-kinds: ${AnalysisKind.CodeScanning}' is not enabled.`,
    );
    return [];
  }

  if (util.isInTestMode()) {
    logger.debug("In test mode. Skipping database upload.");
    return [];
  }

  // Do nothing when not running against github.com
  if (
    config.gitHubVersion.type !== util.GitHubVariant.DOTCOM &&
    config.gitHubVersion.type !== util.GitHubVariant.GHEC_DR
  ) {
    logger.debug("Not running against github.com or GHEC-DR. Skipping upload.");
    return [];
  }

  if (!(await gitUtils.isAnalyzingDefaultBranch())) {
    // We only want to upload a database if we are analyzing the default branch.
    logger.debug("Not analyzing default branch. Skipping upload.");
    return [];
  }

  // If config.overlayDatabaseMode is OverlayBase, then we have overlay base databases for all languages.
  const shouldUploadOverlayBase =
    config.overlayDatabaseMode === OverlayDatabaseMode.OverlayBase &&
    (await features.getValue(Feature.UploadOverlayDbToApi, codeql));
  const cleanupLevel = shouldUploadOverlayBase
    ? CleanupLevel.Overlay
    : CleanupLevel.Clear;

  // Clean up the database, since intermediate results may still be written to the
  // database if there is high RAM pressure.
  await withGroupAsync("Cleaning up databases", async () => {
    await codeql.databaseCleanupCluster(config, cleanupLevel);
  });

  const reports: DatabaseUploadResult[] = [];
  for (const language of config.languages) {
    let bundledDbSize: number | undefined = undefined;
    try {
      // Upload the database bundle.
      // Although we are uploading arbitrary file contents to the API, it's worth
      // noting that it's the API's job to validate that the contents is acceptable.
      // This API method is available to anyone with write access to the repo.
      const bundledDb = await bundleDb(config, language, codeql, language, {
        includeDiagnostics: false,
      });
      bundledDbSize = fs.statSync(bundledDb).size;
      const commitOid = await gitUtils.getCommitOid(
        actionsUtil.getRequiredInput("checkout_path"),
      );
      // Upload with manual retry logic. We disable Octokit's built-in retries
      // because the request body is a ReadStream, which can only be consumed
      // once.
      const maxAttempts = 4; // 1 initial attempt + 3 retries, identical to the default retry behavior of Octokit
      let uploadDurationMs: number | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          uploadDurationMs = await uploadBundledDatabase(
            repositoryNwo,
            language,
            commitOid,
            bundledDb,
            bundledDbSize,
            apiDetails,
          );
          break;
        } catch (e) {
          const httpError = asHTTPError(e);
          const isRetryable =
            !httpError || !DO_NOT_RETRY_STATUSES.includes(httpError.status);
          if (!isRetryable) {
            throw e;
          } else if (attempt === maxAttempts) {
            logger.error(
              `Maximum retry attempts exhausted (${attempt}), aborting database upload`,
            );
            throw e;
          }
          const backoffMs = 15_000 * Math.pow(2, attempt - 1); // 15s, 30s, 60s
          logger.debug(
            `Database upload attempt ${attempt} of ${maxAttempts} failed for ${language}: ${util.getErrorMessage(e)}. Retrying in ${backoffMs / 1000}s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
      reports.push({
        language,
        zipped_upload_size_bytes: bundledDbSize,
        is_overlay_base: shouldUploadOverlayBase,
        upload_duration_ms: uploadDurationMs,
      });
      logger.debug(`Successfully uploaded database for ${language}`);
    } catch (e) {
      // Log a warning but don't fail the workflow
      logger.warning(
        `Failed to upload database for ${language}: ${util.getErrorMessage(e)}`,
      );
      reports.push({
        language,
        error: util.getErrorMessage(e),
        ...(bundledDbSize !== undefined
          ? { zipped_upload_size_bytes: bundledDbSize }
          : {}),
      });
    }
  }

  // When we upload an overlay-base database, we cleaned the databases at the `overlay` level, which
  // retains more data than the `clear` level used for regular uploads. Measure what the zipped size
  // would have been at the `clear` level too, so we can compare the storage cost of overlay-base
  // databases against regular databases for the same repository.
  //
  // We skip this in debug mode, where the databases are preserved and uploaded as debug artifacts,
  // since cleaning them up at the `clear` level would discard data that is useful for debugging.
  if (shouldUploadOverlayBase && !config.debugMode) {
    await withGroupAsync(
      "Measuring database size at the clear cleanup level",
      () => recordClearCleanupSizes(codeql, config, reports, logger),
    );
  }

  return reports;
}

/**
 * Cleans up the databases at the `clear` cleanup level and records the resulting zipped size for
 * each language in `clear_cleanup_zipped_size_bytes`. If the cleanup succeeds, also records the
 * time spent taking the measurement in `clear_cleanup_measurement_duration_ms`.
 *
 * This mutates the entries of `reports` in place. It must run only after all overlay-base uploads
 * have completed, since the `clear` cleanup discards overlay data that the uploaded database
 * depends on.
 *
 * Failures here are non-fatal: this is telemetry-only, so we log and move on rather than failing
 * the workflow.
 */
async function recordClearCleanupSizes(
  codeql: CodeQL,
  config: Config,
  reports: DatabaseUploadResult[],
  logger: Logger,
): Promise<void> {
  // Include both the cleanup and the re-bundling to record how much time taking this measurement adds
  // to the run.
  const startTime = performance.now();

  try {
    await codeql.databaseCleanupCluster(config, CleanupLevel.Clear);
  } catch (e) {
    // The cleanup didn't run, so there are no sizes to measure. Return without recording a
    // duration, so that we don't report a measurement duration with no accompanying sizes.
    logger.warning(
      `Failed to clean up databases at the '${CleanupLevel.Clear}' level for ` +
        `size measurement: ${util.getErrorMessage(e)}`,
    );
    return;
  }

  for (const language of config.languages) {
    const report = reports.find((r) => r.language === language);
    if (report === undefined) {
      continue;
    }
    try {
      const bundledDb = await bundleDb(config, language, codeql, language, {
        includeDiagnostics: false,
      });
      report.clear_cleanup_zipped_size_bytes = fs.statSync(bundledDb).size;
      logger.debug(
        `Database for ${language} is ` +
          `${report.clear_cleanup_zipped_size_bytes} bytes zipped at the ` +
          `'${CleanupLevel.Clear}' cleanup level ` +
          `(vs. ${report.zipped_upload_size_bytes ?? "unknown"} bytes at the ` +
          `'${CleanupLevel.Overlay}' level).`,
      );
    } catch (e) {
      logger.warning(
        `Failed to measure the '${CleanupLevel.Clear}' cleanup database size ` +
          `for ${language}: ${util.getErrorMessage(e)}`,
      );
    }
  }

  const durationMs = performance.now() - startTime;
  for (const report of reports) {
    report.clear_cleanup_measurement_duration_ms = durationMs;
  }
}

/**
 * Uploads a bundled database to the GitHub API.
 *
 * @returns the duration of the upload in milliseconds
 */
async function uploadBundledDatabase(
  repositoryNwo: RepositoryNwo,
  language: string,
  commitOid: string,
  bundledDb: string,
  bundledDbSize: number,
  apiDetails: GitHubApiDetails,
): Promise<number> {
  const client = getApiClient();

  const uploadsUrl = new URL(parseGitHubUrl(apiDetails.url));
  uploadsUrl.hostname = `uploads.${uploadsUrl.hostname}`;

  // Octokit expects the baseUrl to not have a trailing slash,
  // but it is included by default in a URL.
  let uploadsBaseUrl = uploadsUrl.toString();
  if (uploadsBaseUrl.endsWith("/")) {
    uploadsBaseUrl = uploadsBaseUrl.slice(0, -1);
  }

  const bundledDbReadStream = fs.createReadStream(bundledDb);
  try {
    const startTime = performance.now();
    await client.request(
      `POST /repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name&commit_oid=:commit_oid`,
      {
        baseUrl: uploadsBaseUrl,
        owner: repositoryNwo.owner,
        repo: repositoryNwo.repo,
        language,
        name: `${language}-database`,
        commit_oid: commitOid,
        data: bundledDbReadStream,
        headers: {
          authorization: `token ${apiDetails.auth}`,
          "Content-Type": "application/zip",
          "Content-Length": bundledDbSize,
        },
        // Disable `octokit/plugin-retry.js`, since the request body is a ReadStream which can only be consumed once.
        request: {
          retries: 0,
        },
      },
    );
    return performance.now() - startTime;
  } finally {
    bundledDbReadStream.close();
  }
}
