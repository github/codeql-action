"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const stringify_js_1 = require("../stringify.js");
const BYTES = Uint8Array.of(0x0f, 0x5a, 0xbc, 0xd1, 0xc1, 0x94, 0x47, 0xf3, 0x90, 0x5b, 0x2d, 0xf7, 0x26, 0x3a, 0x08, 0x4b);
(0, node_test_1.describe)('stringify', () => {
    (0, node_test_1.default)('Stringify Array (unsafe)', () => {
        assert.equal((0, stringify_js_1.unsafeStringify)(BYTES), '0f5abcd1-c194-47f3-905b-2df7263a084b');
    });
    (0, node_test_1.default)('Stringify w/ offset (unsafe)', () => {
        const bytes = new Uint8Array(19).fill(0);
        bytes.set(BYTES, 3);
        assert.equal((0, stringify_js_1.unsafeStringify)(bytes, 3), '0f5abcd1-c194-47f3-905b-2df7263a084b');
    });
    (0, node_test_1.default)('Stringify Array (safe)', () => {
        assert.equal((0, stringify_js_1.default)(BYTES), '0f5abcd1-c194-47f3-905b-2df7263a084b');
    });
    (0, node_test_1.default)('Throws on not enough values (safe)', () => {
        const bytes = BYTES.slice(0, 15);
        assert.throws(() => (0, stringify_js_1.default)(bytes));
    });
});
