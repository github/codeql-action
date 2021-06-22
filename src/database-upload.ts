import * as fs from "fs";

import * as actionsUtil from "./actions-util";
import { getApiClient, GitHubApiDetails } from "./api-client";
import { getCodeQL } from "./codeql";
import { Config } from "./config-utils";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";
import * as util from "./util";

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

  const client = getApiClient(apiDetails);
  try {
    await client.request("GET /repos/:owner/:repo/code-scanning/databases", {
      owner: repositoryNwo.owner,
      repo: repositoryNwo.repo,
    });
  } catch (e) {
    if (util.isHTTPError(e) && e.status === 404) {
      logger.debug(
        "Repository is not opted in to database uploads. Skipping upload."
      );
    } else {
      console.log(e);
      logger.info(`Skipping database upload due to unknown error: ${e}`);
    }
    return;
  }

  const codeql = getCodeQL(config.codeQLCmd);
  for (const language of config.languages) {
    // Bundle the database up into a single zip file
    const databasePath = util.getCodeQLDatabasePath(config, language);
    const databaseBundlePath = `${databasePath}.zip`;
    await codeql.databaseBundle(databasePath, databaseBundlePath);

    // Upload the database bundle
    const payload = fs.readFileSync(databaseBundlePath);
    try {
      await client.request(
        `PUT /repos/:owner/:repo/code-scanning/databases/${language}`,
        {
          owner: repositoryNwo.owner,
          repo: repositoryNwo.repo,
          data: payload,
        }
      );
      logger.debug(`Successfully uploaded database for ${language}`);
    } catch (e) {
      console.log(e);
      // Log a warning but don't fail the workflow
      logger.warning(`Failed to upload database for ${language}: ${e}`);
    }
  }
}
