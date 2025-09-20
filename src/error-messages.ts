const PACKS_PROPERTY = "packs";

export function getConfigFileOutsideWorkspaceErrorMessage(
  configFile: string,
): string {
  return `The configuration file "${configFile}" is outside of the workspace`;
}

export function getConfigFileDoesNotExistErrorMessage(
  configFile: string,
): string {
  return `The configuration file "${configFile}" does not exist`;
}

export function getConfigFileRepoFormatInvalidMessage(
  configFile: string,
): string {
  let error = `The configuration file "${configFile}" is not a supported remote file reference.`;
  error += " Expected format <owner>/<repository>/<file-path>@<ref>";

  return error;
}

export function getConfigFileFormatInvalidMessage(configFile: string): string {
  return `The configuration file "${configFile}" could not be read`;
}

export function getConfigFileDirectoryGivenMessage(configFile: string): string {
  return `The configuration file "${configFile}" looks like a directory, not a file`;
}

export function getConfigFilePropertyError(
  configFile: string | undefined,
  property: string,
  error: string,
): string {
  if (configFile === undefined) {
    return `The workflow property "${property}" is invalid: ${error}`;
  } else {
    return `The configuration file "${configFile}" is invalid: property "${property}" ${error}`;
  }
}

export function getPacksStrInvalid(
  packStr: string,
  configFile?: string,
): string {
  return configFile
    ? getConfigFilePropertyError(
        configFile,
        PACKS_PROPERTY,
        `"${packStr}" is not a valid pack`,
      )
    : `"${packStr}" is not a valid pack`;
}

export function getNoLanguagesError(): string {
  return (
    "Did not detect any languages to analyze. " +
    "Please update input in workflow or check that GitHub detects the correct languages in your repository."
  );
}

export function getUnknownLanguagesError(languages: string[]): string {
  return `Did not recognize the following languages: ${languages.join(", ")}`;
}
