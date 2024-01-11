"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const init_1 = require("./init");
const languages_1 = require("./languages");
const testing_utils_1 = require("./testing-utils");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("printPathFiltersWarning does not trigger when 'paths' and 'paths-ignore' are undefined", async (t) => {
    const messages = [];
    (0, init_1.printPathFiltersWarning)({
        languages: [languages_1.Language.cpp],
        originalUserInput: {},
    }, (0, testing_utils_1.getRecordingLogger)(messages));
    t.is(messages.length, 0);
});
(0, ava_1.default)("printPathFiltersWarning does not trigger when 'paths' and 'paths-ignore' are empty", async (t) => {
    const messages = [];
    (0, init_1.printPathFiltersWarning)({
        languages: [languages_1.Language.cpp],
        originalUserInput: { paths: [], "paths-ignore": [] },
    }, (0, testing_utils_1.getRecordingLogger)(messages));
    t.is(messages.length, 0);
});
//# sourceMappingURL=init.test.js.map