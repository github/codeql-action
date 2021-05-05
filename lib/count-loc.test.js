"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const count_loc_1 = require("./count-loc");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
testing_utils_1.setupTests(ava_1.default);
ava_1.default("ensure lines of code works for cpp and js", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], [], ["cpp", "js"], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        cpp: 6,
        js: 3,
    });
});
ava_1.default("ensure lines of code can handle undefined language", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], [], ["rb", "py", "hucairz"], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        rb: 6,
        py: 5,
    });
});
ava_1.default("ensure lines of code can handle empty languages", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], [], [], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {});
});
ava_1.default("ensure lines of code can handle includes", async (t) => {
    // note that "**" is always included. The includes are for extra
    // directories outside the normal structure.
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), ["../../src/testdata"], [], ["js"], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        js: 15,
    });
});
ava_1.default("ensure lines of code can handle exclude", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], ["**/*.py"], ["rb", "py"], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        rb: 6,
    });
});
//# sourceMappingURL=count-loc.test.js.map