"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const analyses_1 = require("./analyses");
const util_1 = require("./util");
(0, ava_1.default)("All known analysis kinds can be parsed successfully", async (t) => {
    for (const analysisKind of analyses_1.supportedAnalysisKinds) {
        t.deepEqual(await (0, analyses_1.parseAnalysisKinds)(analysisKind), [analysisKind]);
    }
});
(0, ava_1.default)("Parsing analysis kinds returns unique results", async (t) => {
    const analysisKinds = await (0, analyses_1.parseAnalysisKinds)("code-scanning,code-quality,code-scanning");
    t.deepEqual(analysisKinds, [
        analyses_1.AnalysisKind.CodeScanning,
        analyses_1.AnalysisKind.CodeQuality,
    ]);
});
(0, ava_1.default)("Parsing an unknown analysis kind fails with a configuration error", async (t) => {
    await t.throwsAsync((0, analyses_1.parseAnalysisKinds)("code-scanning,foo"), {
        instanceOf: util_1.ConfigurationError,
    });
});
(0, ava_1.default)("Parsing analysis kinds requires at least one analysis kind", async (t) => {
    await t.throwsAsync((0, analyses_1.parseAnalysisKinds)(","), {
        instanceOf: util_1.ConfigurationError,
    });
});
//# sourceMappingURL=analyses.test.js.map