"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
testing_utils_1.setupTests(ava_1.default);
ava_1.default("parseLanguage", async (t) => {
    // Exact matches
    t.deepEqual(languages_1.parseLanguage("csharp"), languages_1.Language.csharp);
    t.deepEqual(languages_1.parseLanguage("cpp"), languages_1.Language.cpp);
    t.deepEqual(languages_1.parseLanguage("go"), languages_1.Language.go);
    t.deepEqual(languages_1.parseLanguage("java"), languages_1.Language.java);
    t.deepEqual(languages_1.parseLanguage("javascript"), languages_1.Language.javascript);
    t.deepEqual(languages_1.parseLanguage("python"), languages_1.Language.python);
    // Aliases
    t.deepEqual(languages_1.parseLanguage("c"), languages_1.Language.cpp);
    t.deepEqual(languages_1.parseLanguage("c++"), languages_1.Language.cpp);
    t.deepEqual(languages_1.parseLanguage("c#"), languages_1.Language.csharp);
    t.deepEqual(languages_1.parseLanguage("typescript"), languages_1.Language.javascript);
    // Not matches
    t.deepEqual(languages_1.parseLanguage("foo"), undefined);
    t.deepEqual(languages_1.parseLanguage(" "), undefined);
    t.deepEqual(languages_1.parseLanguage(""), undefined);
});
ava_1.default("isTracedLanguage", async (t) => {
    t.true(languages_1.isTracedLanguage(languages_1.Language.cpp));
    t.true(languages_1.isTracedLanguage(languages_1.Language.java));
    t.true(languages_1.isTracedLanguage(languages_1.Language.csharp));
    t.false(languages_1.isTracedLanguage(languages_1.Language.go));
    t.false(languages_1.isTracedLanguage(languages_1.Language.javascript));
    t.false(languages_1.isTracedLanguage(languages_1.Language.python));
});
ava_1.default("isScannedLanguage", async (t) => {
    t.false(languages_1.isScannedLanguage(languages_1.Language.cpp));
    t.false(languages_1.isScannedLanguage(languages_1.Language.java));
    t.false(languages_1.isScannedLanguage(languages_1.Language.csharp));
    t.true(languages_1.isScannedLanguage(languages_1.Language.go));
    t.true(languages_1.isScannedLanguage(languages_1.Language.javascript));
    t.true(languages_1.isScannedLanguage(languages_1.Language.python));
});
//# sourceMappingURL=languages.test.js.map