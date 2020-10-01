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
const logging_1 = require("./logging");
const testing_utils_1 = require("./testing-utils");
const uploadLib = __importStar(require("./upload-lib"));
testing_utils_1.setupTests(ava_1.default);
ava_1.default("validateSarifFileSchema - valid", (t) => {
    const inputFile = `${__dirname}/../src/testdata/valid-sarif.sarif`;
    t.notThrows(() => uploadLib.validateSarifFileSchema(inputFile, logging_1.getRunnerLogger(true)));
});
ava_1.default("validateSarifFileSchema - invalid", (t) => {
    const inputFile = `${__dirname}/../src/testdata/invalid-sarif.sarif`;
    t.throws(() => uploadLib.validateSarifFileSchema(inputFile, logging_1.getRunnerLogger(true)));
});
//# sourceMappingURL=upload-lib.test.js.map