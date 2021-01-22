import * as fs from "fs";
import * as path from "path";

import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as safeWhich from "@chrisgavin/safe-which";

import { GitHubApiExternalRepoDetails } from "./api-client";
import { Logger } from "./logging";

/**
 * Check out repository at the given ref, and return the directory of the checkout.
 */
export async function checkoutExternalRepository(
  repository: string,
  ref: string,
  apiDetails: GitHubApiExternalRepoDetails,
  tempDir: string,
  logger: Logger
): Promise<string> {
  logger.info(`Checking out ${repository}`);

  const checkoutLocation = path.join(tempDir, repository, ref);

  if (!checkoutLocation.startsWith(tempDir)) {
    // this still permits locations that mess with sibling repositories in `tempDir`, but that is acceptable
    throw new Error(
      `'${repository}@${ref}' is not a valid repository and reference.`
    );
  }

  if (!fs.existsSync(checkoutLocation)) {
    const repoCloneURL = buildCheckoutURL(repository, apiDetails);
    await new toolrunner.ToolRunner(await safeWhich.safeWhich("git"), [
      "clone",
      repoCloneURL,
      checkoutLocation,
    ]).exec();
    await new toolrunner.ToolRunner(await safeWhich.safeWhich("git"), [
      `--work-tree=${checkoutLocation}`,
      `--git-dir=${checkoutLocation}/.git`,
      "checkout",
      ref,
    ]).exec();
  }

  return checkoutLocation;
}

export function buildCheckoutURL(
  repository: string,
  apiDetails: GitHubApiExternalRepoDetails
): string {
  const repoCloneURL = new URL(apiDetails.url);
  if (apiDetails.externalRepoAuth !== undefined) {
    repoCloneURL.username = "x-access-token";
    repoCloneURL.password = apiDetails.externalRepoAuth;
  }
  if (!repoCloneURL.pathname.endsWith("/")) {
    repoCloneURL.pathname += "/";
  }
  repoCloneURL.pathname += `${repository}`;
  return repoCloneURL.toString();
}
