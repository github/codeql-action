import {
  CODEQL_VERSION_LANGUAGE_ALIASING,
  CODEQL_VERSION_RESOLVE_ENVIRONMENT,
  getCodeQL,
} from "./codeql";
import { parseLanguage } from "./languages";
import { Logger } from "./logging";
import * as util from "./util";

export async function runResolveBuildEnvironment(
  cmd: string,
  logger: Logger,
  workingDir: string | undefined,
  languageInput: string,
) {
  logger.startGroup(
    `Attempting to resolve build environment for ${languageInput}`,
  );

  const codeql = await getCodeQL(cmd);

  let language = languageInput;
  // If the CodeQL CLI version in use supports language aliasing, give the CLI the raw language
  // input. Otherwise, parse the language input and give the CLI the parsed language.
  if (
    !(await util.codeQlVersionAtLeast(codeql, CODEQL_VERSION_LANGUAGE_ALIASING))
  ) {
    const parsedLanguage = parseLanguage(languageInput)?.toString();
    if (parsedLanguage === undefined) {
      throw new util.ConfigurationError(
        `Did not recognize the language '${languageInput}'.`,
      );
    }
    language = parsedLanguage;
  }

  let result = {};

  // If the CodeQL version in use does not support the `resolve build-environment`
  // command, just return an empty configuration. Otherwise invoke the CLI.
  if (
    !(await util.codeQlVersionAtLeast(
      codeql,
      CODEQL_VERSION_RESOLVE_ENVIRONMENT,
    ))
  ) {
    logger.warning(
      "Unsupported CodeQL CLI version for `resolve build-environment` command, " +
        "returning an empty configuration.",
    );
  } else {
    if (workingDir !== undefined) {
      logger.info(`Using ${workingDir} as the working directory.`);
    }

    result = await codeql.resolveBuildEnvironment(workingDir, language);
  }

  logger.endGroup();
  return result;
}
