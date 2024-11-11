"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const rng_js_1 = require("../rng.js");
(0, node_test_1.describe)('rng', () => {
    (0, node_test_1.default)('Node.js RNG', () => {
        const bytes = (0, rng_js_1.default)();
        assert.equal(bytes.length, 16);
        for (let i = 0; i < bytes.length; ++i) {
            assert.equal(typeof bytes[i], 'number');
        }
    });
});
