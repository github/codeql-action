// defines properties to match against the result of executed commands,
// and a custom error to return when a match is found
export interface ErrorMatcher {
  exitCode?: number; // exit code of the run process
  outputRegex?: RegExp; // pattern to match against either stdout or stderr
  message: string; // the error message that will be thrown for a matching process
}

// exported only for testing purposes
export const namedMatchersForTesting: { [key: string]: ErrorMatcher } = {
  fatalError: {
    outputRegex: new RegExp("A fatal error occurred"),
    message: "A fatal error occurred.",
  },
};

// we collapse the matches into an array for use in execErrorCatcher
export const errorMatchers = Object.values(namedMatchersForTesting);
