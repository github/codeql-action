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
            "https://gh.io/troubleshooting-code-scanning/no-source-code-seen-during-build",
    },
    fatalError: {
        outputRegex: new RegExp("A fatal error occurred"),
        message: "A fatal error occurred.",
    },
};
// we collapse the matches into an array for use in execErrorCatcher
exports.errorMatchers = Object.values(exports.namedMatchersForTesting);
//# sourceMappingURL=error-matcher.js.map