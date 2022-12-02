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
(0, ava_1.default)("noSourceCodeFound matches against example javascript output", async (t) => {
    t.assert(testErrorMatcher("noSourceCodeFound", `
  2020-09-07T17:39:53.9050522Z [2020-09-07 17:39:53] [build] Done extracting /opt/hostedtoolcache/CodeQL/0.0.0-20200630/x64/codeql/javascript/tools/data/externs/web/ie_vml.js (3 ms)
  2020-09-07T17:39:53.9051849Z [2020-09-07 17:39:53] [build-err] No JavaScript or TypeScript code found.
  2020-09-07T17:39:53.9052444Z [2020-09-07 17:39:53] [build-err] No JavaScript or TypeScript code found.
  2020-09-07T17:39:53.9251124Z [2020-09-07 17:39:53] [ERROR] Spawned process exited abnormally (code 255; tried to run: [/opt/hostedtoolcache/CodeQL/0.0.0-20200630/x64/codeql/javascript/tools/autobuild.sh])
  `));
});
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