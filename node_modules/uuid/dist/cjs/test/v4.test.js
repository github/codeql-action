"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const native_js_1 = require("../native.js");
const v4_js_1 = require("../v4.js");
const randomBytesFixture = Uint8Array.of(0x10, 0x91, 0x56, 0xbe, 0xc4, 0xfb, 0xc1, 0xea, 0x71, 0xb4, 0xef, 0xe1, 0x67, 0x1c, 0x58, 0x36);
const expectedBytes = Uint8Array.of(16, 145, 86, 190, 196, 251, 65, 234, 177, 180, 239, 225, 103, 28, 88, 54);
(0, node_test_1.describe)('v4', () => {
    (0, node_test_1.default)('subsequent UUIDs are different', () => {
        const id1 = (0, v4_js_1.default)();
        const id2 = (0, v4_js_1.default)();
        assert.ok(id1 !== id2);
    });
    (0, node_test_1.default)('should uses native randomUUID() if no option is passed', async () => {
        const mock = (await Promise.resolve().then(() => require('node:test'))).default.mock;
        if (!mock) {
            return;
        }
        const mockRandomUUID = mock.method(native_js_1.default, 'randomUUID');
        assert.equal(mockRandomUUID.mock.callCount(), 0);
        (0, v4_js_1.default)();
        assert.equal(mockRandomUUID.mock.callCount(), 1);
        mock.restoreAll();
    });
    (0, node_test_1.default)('should not use native randomUUID() if an option is passed', async () => {
        const mock = (await Promise.resolve().then(() => require('node:test'))).default.mock;
        if (!mock) {
            return;
        }
        const mockRandomUUID = mock.method(native_js_1.default, 'randomUUID');
        assert.equal(mockRandomUUID.mock.callCount(), 0);
        (0, v4_js_1.default)({});
        assert.equal(mockRandomUUID.mock.callCount(), 0);
        mock.restoreAll();
    });
    (0, node_test_1.default)('explicit options.random produces expected result', () => {
        const id = (0, v4_js_1.default)({ random: randomBytesFixture });
        assert.strictEqual(id, '109156be-c4fb-41ea-b1b4-efe1671c5836');
    });
    (0, node_test_1.default)('explicit options.rng produces expected result', () => {
        const id = (0, v4_js_1.default)({ rng: () => randomBytesFixture });
        assert.strictEqual(id, '109156be-c4fb-41ea-b1b4-efe1671c5836');
    });
    (0, node_test_1.default)('fills one UUID into a buffer as expected', () => {
        const buffer = new Uint8Array(16);
        const result = (0, v4_js_1.default)({ random: randomBytesFixture }, buffer);
        assert.deepEqual(buffer, expectedBytes);
        assert.strictEqual(buffer, result);
    });
    (0, node_test_1.default)('fills two UUIDs into a buffer as expected', () => {
        const buffer = new Uint8Array(32);
        (0, v4_js_1.default)({ random: randomBytesFixture }, buffer, 0);
        (0, v4_js_1.default)({ random: randomBytesFixture }, buffer, 16);
        const expectedBuf = new Uint8Array(32);
        expectedBuf.set(expectedBytes);
        expectedBuf.set(expectedBytes, 16);
        assert.deepEqual(buffer, expectedBuf);
    });
});
