"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const uploadLib = __importStar(require("./upload-lib"));
ava_1.default('validateSarifFileSchema - valid', t => {
    const inputFile = __dirname + '/../src/testdata/valid-sarif.sarif';
    t.true(uploadLib.validateSarifFileSchema(inputFile));
});
ava_1.default('validateSarifFileSchema - invalid', t => {
    const inputFile = __dirname + '/../src/testdata/invalid-sarif.sarif';
    t.false(uploadLib.validateSarifFileSchema(inputFile));
    // validateSarifFileSchema calls core.setFailed which sets the exit code on error
    process.exitCode = 0;
});
//# sourceMappingURL=upload-lib.test.js.map