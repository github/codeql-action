export enum CliError {
  IncompatibleWithActionVersion,
  InitCalledTwice,
  InvalidSourceRoot,
  NoJavaScriptTypeScriptCodeFound,
}

/**
 * All of our caught CLI error messages that we handle specially: ie. if we
 * would like to categorize an error as a configuration error or not. Optionally
 * associated with a CLI error code as well. Note that the CLI error code, if
 * it exists, always takes precedence over the error message snippet.
 */
export const cliErrorsConfig: Record<
  CliError,
  {
    cliErrorMessageSnippets: string[];
    exitCode?: number;
  }
> = {
  // Version of CodeQL CLI is incompatible with this version of the CodeQL Action
  [CliError.IncompatibleWithActionVersion]: {
    cliErrorMessageSnippets: ["is not compatible with this CodeQL CLI"],
  },
  [CliError.InitCalledTwice]: {
    cliErrorMessageSnippets: [
      "Refusing to create databases",
      "exists and is not an empty directory",
    ],
  },
  // Expected source location for database creation does not exist
  [CliError.InvalidSourceRoot]: {
    cliErrorMessageSnippets: ["Invalid source root"],
  },
  /**
   * Earlier versions of the JavaScript extractor (pre-CodeQL 2.12.0) extract externs even if no
   * source code was found. This means that we don't get the no code found error from
   * `codeql database finalize`. To ensure users get a good error message, we detect this manually
   * here, and upon detection override the error message.
   *
   * This can be removed once support for CodeQL 2.11.6 is removed.
   */
  [CliError.NoJavaScriptTypeScriptCodeFound]: {
    exitCode: 32,
    cliErrorMessageSnippets: ["No JavaScript or TypeScript code found."],
  },
};

/**
 * Checks whether or not the error message received from the CLI is a config
 * error: if there is an exit code, this takes precedence. Otherwise, matches
 * the error message against the expected message snippets.
 */
export function isConfigurationError(
  cliError: CliError,
  cliErrorMessage: string,
  exitCode?: number,
): boolean {
  const cliErrorConfig = cliErrorsConfig[cliError];

  // If both exit codes exist, exit codes take precedence over message matching.
  if (exitCode && cliErrorConfig.exitCode) {
    return exitCode === cliErrorConfig.exitCode;
  }

  for (const e of cliErrorConfig.cliErrorMessageSnippets) {
    if (!cliErrorMessage.includes(e)) {
      return false;
    }
  }
  return true;
}
