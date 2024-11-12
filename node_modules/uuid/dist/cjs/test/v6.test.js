"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const v1ToV6_js_1 = require("../v1ToV6.js");
const v6_js_1 = require("../v6.js");
const v6ToV1_js_1 = require("../v6ToV1.js");
(0, node_test_1.describe)('v6', () => {
    const V1_ID = 'f1207660-21d2-11ef-8c4f-419efbd44d48';
    const V6_ID = '1ef21d2f-1207-6660-8c4f-419efbd44d48';
    const fullOptions = {
        msecs: 0x133b891f705,
        nsecs: 0x1538,
        clockseq: 0x385c,
        node: Uint8Array.of(0x61, 0xcd, 0x3c, 0xbb, 0x32, 0x10),
    };
    const EXPECTED_BYTES = Uint8Array.of(0x1e, 0x11, 0x22, 0xbd, 0x94, 0x28, 0x68, 0x88, 0xb8, 0x5c, 0x61, 0xcd, 0x3c, 0xbb, 0x32, 0x10);
    (0, node_test_1.default)('default behavior', () => {
        const id = (0, v6_js_1.default)();
        assert.ok(/[0-9a-f]{8}-[0-9a-f]{4}-6[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/.test(id), 'id is valid v6 UUID');
    });
    (0, node_test_1.default)('default behavior (binary type)', () => {
        const buffer = new Uint8Array(16);
        const result = (0, v6_js_1.default)(fullOptions, buffer);
        assert.deepEqual(buffer, EXPECTED_BYTES);
        assert.strictEqual(buffer, result);
    });
    (0, node_test_1.default)('all options', () => {
        const id = (0, v6_js_1.default)(fullOptions);
        assert.equal(id, '1e1122bd-9428-6888-b85c-61cd3cbb3210');
    });
    (0, node_test_1.default)('sort by creation time', () => {
        const ids = [];
        for (let i = 0; i < 5; i++) {
            ids.push((0, v6_js_1.default)({ msecs: i * 1000 }));
        }
        assert.deepEqual(ids, ids.slice().sort());
    });
    (0, node_test_1.default)('creating at array offset', () => {
        const buffer = new Uint8Array(32);
        (0, v6_js_1.default)(fullOptions, buffer, 0);
        (0, v6_js_1.default)(fullOptions, buffer, 16);
        const expectedBuf = new Uint8Array(32);
        expectedBuf.set(EXPECTED_BYTES, 0);
        expectedBuf.set(EXPECTED_BYTES, 16);
        assert.deepEqual(buffer, expectedBuf);
    });
    (0, node_test_1.default)('v1 -> v6 conversion', () => {
        const id = (0, v1ToV6_js_1.default)(V1_ID);
        assert.equal(id, V6_ID);
    });
    (0, node_test_1.default)('v6 -> v1 conversion', () => {
        const id = (0, v6ToV1_js_1.default)(V6_ID);
        assert.equal(id, V1_ID);
    });
});
