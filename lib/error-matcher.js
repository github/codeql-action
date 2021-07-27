"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMatchers = exports.namedMatchersForTesting = void 0;
// exported only for testing purposes
exports.namedMatchersForTesting = {
    /*
    In due course it may be possible to remove the regex, if/when javascript also exits with code 32.
    */
    noSourceCodeFound: {
        exitCode: 32,
        outputRegex: new RegExp("No JavaScript or TypeScript code found\\."),
        message: "No code found during the build. Please see:\n" +
            "https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/troubleshooting-code-scanning#no-code-found-during-the-build",
    },
};
// we collapse the matches into an array for use in execErrorCatcher
exports.errorMatchers = Object.values(exports.namedMatchersForTesting);
//# sourceMappingURL=error-matcher.js.map