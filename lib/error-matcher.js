"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// exported only for testing purposes
exports.namedMatchersForTesting = {
    /*
    In due course it may be possible to remove the regex, if/when javascript also exits with code 32.
     For context see https://github.com/github/semmle-code/pull/36921
    */
    noSourceCodeFound: [
        32,
        new RegExp("No JavaScript or TypeScript code found\\."),
        `No source code was seen during the build. Please see...
https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/troubleshooting-code-scanning#no-code-found-during-the-build`
    ],
};
// we collapse the matches into an array for use in execErrorCatcher
exports.errorMatchers = Object.values(exports.namedMatchersForTesting);
//# sourceMappingURL=error-matcher.js.map