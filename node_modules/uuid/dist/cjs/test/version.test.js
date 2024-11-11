"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const version_js_1 = require("../version.js");
const test_constants_js_1 = require("./test_constants.js");
(0, node_test_1.describe)('version()', () => {
    (0, node_test_1.default)('TESTS cases', () => {
        for (const { value, expectedValidate, expectedVersion } of test_constants_js_1.TESTS) {
            try {
                const actualVersion = (0, version_js_1.default)(value);
                assert.ok(expectedValidate, `version(${value}) should throw`);
                assert.strictEqual(actualVersion, expectedVersion);
            }
            catch {
                assert.ok(!expectedValidate, `version(${value}) threw unexpectedly`);
            }
        }
    });
});
