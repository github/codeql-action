"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const ava_1 = __importDefault(require("ava"));
const count_loc_1 = require("./count-loc");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
testing_utils_1.setupTests(ava_1.default);
ava_1.default("ensure lines of code works for cpp and js", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], [], [languages_1.Language.cpp, languages_1.Language.javascript], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        cpp: 6,
        javascript: 9,
    });
});
ava_1.default("ensure lines of code works for csharp", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], [], [languages_1.Language.csharp], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        csharp: 10,
    });
});
ava_1.default("ensure lines of code can handle undefined language", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], [], [languages_1.Language.javascript, languages_1.Language.python, "hucairz"], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        javascript: 9,
        python: 5,
    });
});
ava_1.default("ensure lines of code can handle empty languages", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], [], [], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {});
});
ava_1.default("ensure lines of code can handle includes", async (t) => {
    // note that "**" is always included. The includes are for extra
    // directories outside the normal structure.
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), ["../../src/testdata"], [], [languages_1.Language.javascript], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        javascript: 12,
    });
});
ava_1.default("ensure lines of code can handle empty includes", async (t) => {
    // note that "**" is always included. The includes are for extra
    // directories outside the normal structure.
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), ["idontexist"], [], [languages_1.Language.javascript], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
    // should get no results
    });
});
ava_1.default("ensure lines of code can handle exclude", async (t) => {
    const results = await count_loc_1.countLoc(path.join(__dirname, "../tests/multi-language-repo"), [], ["**/*.py"], [languages_1.Language.javascript, languages_1.Language.python], logging_1.getRunnerLogger(true));
    t.deepEqual(results, {
        javascript: 9,
    });
});
//# sourceMappingURL=count-loc.test.js.map