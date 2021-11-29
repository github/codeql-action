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

  const client = getApiClient(apiDetails);
  let useUploadDomain: boolean;
  try {
    const response = await client.request(
      "GET /repos/:owner/:repo/code-scanning/codeql/databases",
      {
        owner: repositoryNwo.owner,
        repo: repositoryNwo.repo,
      }
    );
    useUploadDomain = response.data["uploads_domain_enabled"];
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

  const codeql = await getCodeQL(config.codeQLCmd);
  for (const language of config.languages) {
    // Upload the database bundle
    const payload = fs.readFileSync(await bundleDb(config, language, codeql));
    try {
      if (useUploadDomain) {
        await client.request(
          `POST https://uploads.github.com/repos/:owner/:repo/code-scanning/codeql/databases/:language?name=:name`,
          {
            owner: repositoryNwo.owner,
            repo: repositoryNwo.repo,
            language,
            name: `${language}-database`,
            data: payload,
            headers: {
              authorization: `token ${apiDetails.auth}`,
            },
          }
        );
      } else {
        await client.request(
          `PUT /repos/:owner/:repo/code-scanning/codeql/databases/:language`,
          {
            owner: repositoryNwo.owner,
            repo: repositoryNwo.repo,
            language,
            data: payload,
          }
        );
      }
      logger.debug(`Successfully uploaded database for ${language}`);
    } catch (e) {
      console.log(e);
      // Log a warning but don't fail the workflow
      logger.warning(`Failed to upload database for ${language}: ${e}`);
    }
  }
}
