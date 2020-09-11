
export type ErrorMatcher = [number|null, RegExp|null, string];

// exported only for testing purposes
export const namedMatchersForTesting: { [key: string]: ErrorMatcher } = {
  /*
  In due course it may be possible to remove the regex, if/when javascript also exits with code 32.
  */
  noSourceCodeFound: [
    32,
    new RegExp("No JavaScript or TypeScript code found\\."),
    "No code found during the build. Please see:\n" +
    "https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/troubleshooting-code-scanning#no-code-found-during-the-build"
  ],
};

// we collapse the matches into an array for use in execErrorCatcher
export const errorMatchers = Object.values(namedMatchersForTesting);
