"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("parseLanguage", async (t) => {
    // Exact matches
    t.deepEqual((0, languages_1.parseLanguage)("csharp"), languages_1.Language.csharp);
    t.deepEqual((0, languages_1.parseLanguage)("cpp"), languages_1.Language.cpp);
    t.deepEqual((0, languages_1.parseLanguage)("go"), languages_1.Language.go);
    t.deepEqual((0, languages_1.parseLanguage)("java"), languages_1.Language.java);
    t.deepEqual((0, languages_1.parseLanguage)("javascript"), languages_1.Language.javascript);
    t.deepEqual((0, languages_1.parseLanguage)("python"), languages_1.Language.python);
    t.deepEqual((0, languages_1.parseLanguage)("rust"), languages_1.Language.rust);
    // Aliases
    t.deepEqual((0, languages_1.parseLanguage)("c"), languages_1.Language.cpp);
    t.deepEqual((0, languages_1.parseLanguage)("c++"), languages_1.Language.cpp);
    t.deepEqual((0, languages_1.parseLanguage)("c#"), languages_1.Language.csharp);
    t.deepEqual((0, languages_1.parseLanguage)("kotlin"), languages_1.Language.java);
    t.deepEqual((0, languages_1.parseLanguage)("typescript"), languages_1.Language.javascript);
    // spaces and case-insensitivity
    t.deepEqual((0, languages_1.parseLanguage)("  \t\nCsHaRp\t\t"), languages_1.Language.csharp);
    t.deepEqual((0, languages_1.parseLanguage)("  \t\nkOtLin\t\t"), languages_1.Language.java);
    // Not matches
    t.deepEqual((0, languages_1.parseLanguage)("foo"), undefined);
    t.deepEqual((0, languages_1.parseLanguage)(" "), undefined);
    t.deepEqual((0, languages_1.parseLanguage)(""), undefined);
});
(0, ava_1.default)("isTracedLanguage", async (t) => {
    t.true((0, languages_1.isTracedLanguage)(languages_1.Language.cpp));
    t.true((0, languages_1.isTracedLanguage)(languages_1.Language.csharp));
    t.true((0, languages_1.isTracedLanguage)(languages_1.Language.go));
    t.true((0, languages_1.isTracedLanguage)(languages_1.Language.java));
    t.true((0, languages_1.isTracedLanguage)(languages_1.Language.swift));
    t.false((0, languages_1.isTracedLanguage)(languages_1.Language.javascript));
    t.false((0, languages_1.isTracedLanguage)(languages_1.Language.python));
    t.false((0, languages_1.isTracedLanguage)(languages_1.Language.ruby));
    t.false((0, languages_1.isTracedLanguage)(languages_1.Language.rust));
});
(0, ava_1.default)("isScannedLanguage", async (t) => {
    t.false((0, languages_1.isScannedLanguage)(languages_1.Language.cpp));
    t.false((0, languages_1.isScannedLanguage)(languages_1.Language.csharp));
    t.false((0, languages_1.isScannedLanguage)(languages_1.Language.go));
    t.false((0, languages_1.isScannedLanguage)(languages_1.Language.java));
    t.false((0, languages_1.isScannedLanguage)(languages_1.Language.swift));
    t.true((0, languages_1.isScannedLanguage)(languages_1.Language.javascript));
    t.true((0, languages_1.isScannedLanguage)(languages_1.Language.python));
    t.true((0, languages_1.isScannedLanguage)(languages_1.Language.ruby));
    t.true((0, languages_1.isScannedLanguage)(languages_1.Language.rust));
});
//# sourceMappingURL=languages.test.js.map