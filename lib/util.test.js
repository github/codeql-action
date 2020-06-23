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
const fs = __importStar(require("fs"));
const testing_utils_1 = require("./testing-utils");
const util = __importStar(require("./util"));
testing_utils_1.silenceDebugOutput(ava_1.default);
ava_1.default('getToolNames', t => {
    const input = fs.readFileSync(__dirname + '/../src/testdata/tool-names.sarif', 'utf8');
    const toolNames = util.getToolNames(input);
    t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});
//# sourceMappingURL=util.test.js.map