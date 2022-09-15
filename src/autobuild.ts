import { getCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { FeatureFlags } from "./feature-flags";
import { Language, isTracedLanguage } from "./languages";
import { Logger } from "./logging";
import * as util from "./util";

export async function determineAutobuildLanguage(
  config: configUtils.Config,
  featureFlags: FeatureFlags,
  logger: Logger
): Promise<Language | undefined> {
  const isGoExtractionReconciliationEnabled =
    await util.isGoExtractionReconciliationEnabled(featureFlags);
  // Attempt to find a language to autobuild
  // We want pick the dominant language in the repo from the ones we're able to build
  // The languages are sorted in order specified by user or by lines of code if we got
  // them from the GitHub API, so try to build the first language on the list.
  const autobuildLanguages = config.languages.filter((l) =>
    isTracedLanguage(l, isGoExtractionReconciliationEnabled, logger)
  );
  const language = autobuildLanguages[0];

  if (!language) {
    logger.info(
      "None of the languages in this project require extra build steps"
    );
    return undefined;
  }

  logger.debug(`Detected dominant traced language: ${language}`);

  if (autobuildLanguages.length > 1) {
    logger.warning(
      `We will only automatically build ${language} code. If you wish to scan ${autobuildLanguages
        .slice(1)
        .join(" and ")}, you must replace this call with custom build steps.`
    );
  }

  return language;
}

export async function runAutobuild(
  language: Language,
  config: configUtils.Config,
  logger: Logger
) {
  logger.startGroup(`Attempting to automatically build ${language} code`);
  const codeQL = await getCodeQL(config.codeQLCmd);
  await codeQL.runAutobuild(language);
  logger.endGroup();
}
