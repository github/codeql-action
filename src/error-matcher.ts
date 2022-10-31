// defines properties to match against the result of executed commands,
// and a custom error to return when a match is found
export interface ErrorMatcher {
  exitCode?: number; // exit code of the run process
  outputRegex?: RegExp; // pattern to match against either stdout or stderr
  message: string; // the error message that will be thrown for a matching process
}

// exported only for testing purposes
export const namedMatchersForTesting: { [key: string]: ErrorMatcher } = {
  /*
  In due course it may be possible to remove the regex, if/when javascript also exits with code 32.
  */
  noSourceCodeFound: {
    exitCode: 32,
    outputRegex: new RegExp(
      "Only found JavaScript or TypeScript files that were empty or contained syntax errors\\."
    ),
    message:
      "No code found during the build. Please see:\n" +
      "https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/troubleshooting-code-scanning#no-code-found-during-the-build",
  },
};

// we collapse the matches into an array for use in execErrorCatcher
export const errorMatchers = Object.values(namedMatchersForTesting);
