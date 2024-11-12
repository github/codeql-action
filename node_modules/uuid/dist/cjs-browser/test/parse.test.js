"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const parse_js_1 = require("../parse.js");
const stringify_js_1 = require("../stringify.js");
const v4_js_1 = require("../v4.js");
function splitmix32(a) {
    return function () {
        a |= 0;
        a = (a + 0x9e3779b9) | 0;
        let t = a ^ (a >>> 16);
        t = Math.imul(t, 0x21f0aaad);
        t = t ^ (t >>> 15);
        t = Math.imul(t, 0x735a2d97);
        return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
    };
}
const rand = splitmix32(0x12345678);
function rng(bytes = new Uint8Array(16)) {
    for (let i = 0; i < 16; i++) {
        bytes[i] = rand() * 256;
    }
    return bytes;
}
(0, node_test_1.describe)('parse', () => {
    (0, node_test_1.default)('String -> bytes parsing', () => {
        assert.deepStrictEqual((0, parse_js_1.default)('0f5abcd1-c194-47f3-905b-2df7263a084b'), Uint8Array.from([
            0x0f, 0x5a, 0xbc, 0xd1, 0xc1, 0x94, 0x47, 0xf3, 0x90, 0x5b, 0x2d, 0xf7, 0x26, 0x3a, 0x08,
            0x4b,
        ]));
    });
    (0, node_test_1.default)('String -> bytes -> string symmetry for assorted uuids', () => {
        for (let i = 0; i < 1000; i++) {
            const uuid = (0, v4_js_1.default)({ rng });
            assert.equal((0, stringify_js_1.default)((0, parse_js_1.default)(uuid)), uuid);
        }
    });
    (0, node_test_1.default)('Case neutrality', () => {
        assert.deepStrictEqual((0, parse_js_1.default)('0f5abcd1-c194-47f3-905b-2df7263a084b'), (0, parse_js_1.default)('0f5abcd1-c194-47f3-905b-2df7263a084b'.toUpperCase()));
    });
    (0, node_test_1.default)('Null UUID case', () => {
        assert.deepStrictEqual((0, parse_js_1.default)('00000000-0000-0000-0000-000000000000'), Uint8Array.from(new Array(16).fill(0)));
    });
    (0, node_test_1.default)('UUID validation', () => {
        assert.throws(() => (0, parse_js_1.default)());
        assert.throws(() => (0, parse_js_1.default)('invalid uuid'));
        assert.throws(() => (0, parse_js_1.default)('zyxwvuts-rqpo-nmlk-jihg-fedcba000000'));
    });
});
