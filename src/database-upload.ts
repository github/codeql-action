import * as fs from "fs";

import * as actionsUtil from "./actions-util";
import { AnalysisKind } from "./analyses";
import { getApiClient, GitHubApiDetails } from "./api-client";
import { type CodeQL } from "./codeql";
import { Config } from "./config-utils";
import * as gitUtils from "./git-utils";
import { Logger, withGroupAsync } from "./logging";
import { RepositoryNwo } from "./repository";
import * as util from "./util";
import { bundleDb, parseGitHubUrl } from "./util";

export async function uploadDatabases(
  repositoryNwo: RepositoryNwo,
  codeql: CodeQL,
  config: Config,
  apiDetails: GitHubApiDetails,
  logger: Logger,
): Promise<void> {
  if (actionsUtil.getRequiredInput("upload-database") !== "true") {
    logger.debug("Database upload disabled in workflow. Skipping upload.");
    return;
  }

  if (!config.analysisKinds.includes(AnalysisKind.CodeScanning)) {
    logger.debug(
      `Not uploading database because 'analysis-kinds: ${AnalysisKind.CodeScanning}' is not enabled.`,
    );
    return;
  }

  if (util.isInTestMode()) {
    logger.debug("In test mode. Skipping database upload.");
    return;
  }

  // Do nothing when not running against github.com
  if (
    config.gitHubVersion.type !== util.GitHubVariant.DOTCOM &&
    config.gitHubVersion.type !== util.GitHubVariant.GHE_DOTCOM
  ) {
    logger.debug("Not running against github.com or GHEC-DR. Skipping upload.");
    return;
  }

  if (!(await gitUtils.isAnalyzingDefaultBranch())) {
    // We only want to upload a database if we are analyzing the default branch.
    logger.debug("Not analyzing default branch. Skipping upload.");
    return;
  }

  // Clean up the database, since intermediate results may still be written to the
  // database if there is high RAM pressure.
  await withGroupAsync("Cleaning up databases", async () => {
    await codeql.databaseCleanupCluster(config, "clear");
  });

  const client = getApiClient();

  const uploadsUrl = new URL(parseGitHubUrl(apiDetails.url));
  uploadsUrl.hostname = `uploads.${uploadsUrl.hostname}`;

  // Octokit expects the baseUrl to not have a trailing slash,
  // but it is included by default in a URL.
  let uploadsBaseUrl = uploadsUrl.toString();
  if (uploadsBaseUrl.endsWith("/")) {
    uploadsBaseUrl = uploadsBaseUrl.slice(0, -1);
  }

  for (const language of config.languages) {
    try {
      // Upload the database bundle.
      // Although we are uploading arbitrary file contents to the API, it's worth
      // noting that it's the API's job to validate that the contents is acceptable.
      // This API method is available to anyone with write access to the repo.
      const bundledDb = await bundleDb(config, language, codeql, language);
      const bundledDbSize = fs.statSync(bundledDb).size;
      const bundledDbReadStream = fs.createReadStream(bundledDb);
      const commitOid = await gitUtils.getCommitOid(
        actionsUtil.getRequiredInput("checkout_path"),
      );
      try {
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
          },
        );
        logger.debug(`Successfully uploaded database for ${language}`);
      } finally {
        bundledDbReadStream.close();
      }
    } catch (e) {
      // Log a warning but don't fail the workflow
      logger.warning(`Failed to upload database for ${language}: ${e}`);
    }
  }
}
