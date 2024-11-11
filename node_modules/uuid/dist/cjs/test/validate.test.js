"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const validate_js_1 = require("../validate.js");
const test_constants_js_1 = require("./test_constants.js");
(0, node_test_1.describe)('validate()', () => {
    (0, node_test_1.default)('TESTS cases', () => {
        for (const { value, expectedValidate } of test_constants_js_1.TESTS) {
            assert.strictEqual((0, validate_js_1.default)(value), expectedValidate, `validate(${value}) should be ${expectedValidate}`);
        }
    });
});
