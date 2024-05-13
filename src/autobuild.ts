import * as core from "@actions/core";

import { getTemporaryDirectory, getWorkflowEventName } from "./actions-util";
import { getGitHubVersion } from "./api-client";
import { CodeQL, getCodeQL } from "./codeql";
import * as configUtils from "./config-utils";
import { EnvVar } from "./environment";
import {
  Feature,
  featureConfig,
  FeatureEnablement,
  Features,
} from "./feature-flags";
import { isTracedLanguage, Language } from "./languages";
import { Logger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import { ToolsFeature } from "./tools-features";
import { BuildMode, getRequiredEnvParam } from "./util";

export async function determineAutobuildLanguages(
  codeql: CodeQL,
  config: configUtils.Config,
  logger: Logger,
): Promise<Language[] | undefined> {
  if (
    (config.buildMode === BuildMode.None &&
      (await codeql.supportsFeature(ToolsFeature.TraceCommandUseBuildMode))) ||
    config.buildMode === BuildMode.Manual
  ) {
    logger.info(`Using ${config.buildMode} build mode, nothing to autobuild.`);
    return undefined;
  }

  // Attempt to find a language to autobuild
  // We want pick the dominant language in the repo from the ones we're able to build
  // The languages are sorted in order specified by user or by lines of code if we got
  // them from the GitHub API, so try to build the first language on the list.
  const autobuildLanguages = config.languages.filter((l) =>
    isTracedLanguage(l),
  );

  if (!autobuildLanguages) {
    logger.info(
      "None of the languages in this project require extra build steps",
    );
    return undefined;
  }

  /**
   * Additionally autobuild Go in the autobuild Action to ensure backwards
   * compatibility for users performing a multi-language build within a single
   * job.
   *
   * For example, consider a user with the following workflow file:
   *
   * ```yml
   * - uses: github/codeql-action/init@v3
   *   with:
   *     languages: go, java
   * - uses: github/codeql-action/autobuild@v3
   * - uses: github/codeql-action/analyze@v3
   * ```
   *
   * - With Go extraction disabled, we will run the Java autobuilder in the
   *   autobuild Action, ensuring we extract both Java and Go code.
   * - With Go extraction enabled, taking the previous behavior we'd run the Go
   *   autobuilder, since Go is first on the list of languages. We wouldn't run
   *   the Java autobuilder at all and so we'd only extract Go code.
   *
   * We therefore introduce a special case here such that we'll autobuild Go
   * in addition to the primary non-Go traced language in the autobuild Action.
   *
   * This special case behavior should be removed as part of the next major
   * version of the CodeQL Action.
   */
  const autobuildLanguagesWithoutGo = autobuildLanguages.filter(
    (l) => l !== Language.go,
  );

  const languages: Language[] = [];
  // First run the autobuilder for the first non-Go traced language, if one
  // exists.
  if (autobuildLanguagesWithoutGo[0] !== undefined) {
    languages.push(autobuildLanguagesWithoutGo[0]);
  }
  // If Go is requested, run the Go autobuilder last to ensure it doesn't
  // interfere with the other autobuilder.
  if (autobuildLanguages.length !== autobuildLanguagesWithoutGo.length) {
    languages.push(Language.go);
  }

  logger.debug(`Will autobuild ${languages.join(" and ")}.`);

  // In general the autobuilders for other traced languages may conflict with
  // each other. Therefore if a user has requested more than one non-Go traced
  // language, we ask for manual build steps.
  // Matrixing the build would also work, but that would change the SARIF
  // categories, potentially leading to a "stale tips" situation where alerts
  // that should be fixed remain on a repo since they are linked to SARIF
  // categories that are no longer updated.
  if (autobuildLanguagesWithoutGo.length > 1) {
    logger.warning(
      `We will only automatically build ${languages.join(
        " and ",
      )} code. If you wish to scan ${autobuildLanguagesWithoutGo
        .slice(1)
        .join(
          " and ",
        )}, you must replace the autobuild step of your workflow with custom build steps. ` +
        "For more information, see " +
        "https://docs.github.com/en/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/configuring-the-codeql-workflow-for-compiled-languages#adding-build-steps-for-a-compiled-language",
    );
  }

  return languages;
}

export async function setupCppAutobuild(codeql: CodeQL, logger: Logger) {
  const envVar = featureConfig[Feature.CppDependencyInstallation].envVar;
  const featureName = "C++ automatic installation of dependencies";
  const envDoc =
    "https://docs.github.com/en/actions/learn-github-actions/variables#defining-environment-variables-for-a-single-workflow";
  const gitHubVersion = await getGitHubVersion();
  const repositoryNwo = parseRepositoryNwo(
    getRequiredEnvParam("GITHUB_REPOSITORY"),
  );
  const features = new Features(
    gitHubVersion,
    repositoryNwo,
    getTemporaryDirectory(),
    logger,
  );
  if (await features.getValue(Feature.CppDependencyInstallation, codeql)) {
    // disable autoinstall on self-hosted runners unless explicitly requested
    if (
      process.env["RUNNER_ENVIRONMENT"] === "self-hosted" &&
      process.env[envVar] !== "true"
    ) {
      logger.info(
        `Disabling ${featureName} as we are on a self-hosted runner.${
          getWorkflowEventName() !== "dynamic"
            ? ` To override this, set the ${envVar} environment variable to 'true' in your workflow (see ${envDoc}).`
            : ""
        }`,
      );
      core.exportVariable(envVar, "false");
    } else {
      logger.info(
        `Enabling ${featureName}. This can be disabled by setting the ${envVar} environment variable to 'false' (see ${envDoc}).`,
      );
      core.exportVariable(envVar, "true");
    }
  } else {
    logger.info(`Disabling ${featureName}.`);
    core.exportVariable(envVar, "false");
  }
}

export async function runAutobuild(
  config: configUtils.Config,
  language: Language,
  features: FeatureEnablement,
  logger: Logger,
) {
  logger.startGroup(`Attempting to automatically build ${language} code`);
  const codeQL = await getCodeQL(config.codeQLCmd);
  if (language === Language.cpp) {
    await setupCppAutobuild(codeQL, logger);
  }
  if (
    config.buildMode &&
    (await features.getValue(Feature.AutobuildDirectTracing, codeQL))
  ) {
    await codeQL.extractUsingBuildMode(config, language);
  } else {
    await codeQL.runAutobuild(config, language);
  }
  if (language === Language.go) {
    core.exportVariable(EnvVar.DID_AUTOBUILD_GOLANG, "true");
  }
  logger.endGroup();
}
