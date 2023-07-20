"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMatchers = exports.namedMatchersForTesting = void 0;
// exported only for testing purposes
exports.namedMatchersForTesting = {
    fatalError: {
        outputRegex: new RegExp("A fatal error occurred"),
        message: "A fatal error occurred.",
    },
};
// we collapse the matches into an array for use in execErrorCatcher
exports.errorMatchers = Object.values(exports.namedMatchersForTesting);
//# sourceMappingURL=error-matcher.js.map