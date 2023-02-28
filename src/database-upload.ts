import * as fs from "fs";

import * as actionsUtil from "./actions-util";
import { getApiClient, GitHubApiDetails } from "./api-client";
import { getCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import * as util from "./util";
import { bundleDb } from "./util";

export async function uploadDatabases(
  repositoryNwo: RepositoryNwo,
  config: Config,
  apiDetails: GitHubApiDetails,
  logger: Logger
): Promise<void> {
  if (actionsUtil.getRequiredInput("upload-database") !== "true") {
    logger.debug("Database upload disabled in workflow. Skipping upload.");
    return;
  }

  // Do nothing when not running against github.com
  if (config.gitHubVersion.type !== util.GitHubVariant.DOTCOM) {
    logger.debug("Not running against github.com. Skipping upload.");
    return;
  }

  if (!(await actionsUtil.isAnalyzingDefaultBranch())) {
    // We only want to upload a database if we are analyzing the default branch.
    logger.debug("Not analyzing default branch. Skipping upload.");
    return;
  }

  const client = getApiClient();
  const codeql = await getCodeQL(config.codeQLCmd);

  for (const language of config.languages) {
    try {
      // Upload the database bundle.
      // Although we are uploading arbitrary file contents to the API, it's worth
      // noting that it's the API's job to validate that the contents is acceptable.
      // This API method is available to anyone with write access to the repo.
      const bundledDb = await bundleDb(config, language, codeql, language);
      const bundledDbSize = fs.statSync(bundledDb).size;
      const bundledDbReadStream = fs.createReadStream(bundledDb);
      try {
        await client.request(
          `POST https://uploads.github.com/repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name`,
          {
            owner: repositoryNwo.owner,
            repo: repositoryNwo.repo,
            language,
            name: `${language}-database`,
            data: bundledDbReadStream,
            headers: {
              authorization: `token ${apiDetails.auth}`,
              "Content-Type": "application/zip",
              "Content-Length": bundledDbSize,
            },
          }
        );
        logger.debug(`Successfully uploaded database for ${language}`);
      } finally {
        bundledDbReadStream.close();
      }
    } catch (e) {
      console.log(e);
      // Log a warning but don't fail the workflow
      logger.warning(`Failed to upload database for ${language}: ${e}`);
    }
  }
}
