"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const error_matcher_1 = require("./error-matcher");
/*
NB We test the regexes for all the matchers against example log output snippets.
*/
(0, ava_1.default)("fatalError matches against example log output", async (t) => {
    t.assert(testErrorMatcher("fatalError", "A fatal error occurred: Could not process query metadata for test-query.ql"));
});
function testErrorMatcher(matcherName, logSample) {
    if (!(matcherName in error_matcher_1.namedMatchersForTesting)) {
        throw new Error(`Unknown matcher ${matcherName}`);
    }
    const regex = error_matcher_1.namedMatchersForTesting[matcherName].outputRegex;
    if (regex === undefined) {
        throw new Error(`Cannot test matcher ${matcherName} with null regex`);
    }
    return regex.test(logSample);
}
//# sourceMappingURL=error-matcher.test.js.map