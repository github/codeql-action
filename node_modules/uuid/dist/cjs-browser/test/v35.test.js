"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const md5_js_1 = require("../md5.js");
const sha1_js_1 = require("../sha1.js");
const v3_js_1 = require("../v3.js");
const v35_js_1 = require("../v35.js");
const v5_js_1 = require("../v5.js");
(0, node_test_1.describe)('v35', () => {
    const HASH_SAMPLES = [
        {
            input: (0, v35_js_1.stringToBytes)(''),
            sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
            md5: 'd41d8cd98f00b204e9800998ecf8427e',
        },
        {
            input: (0, v35_js_1.stringToBytes)('\t\b\f  !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u00A1\u00A2\u00A3\u00A4\u00A5\u00A6\u00A7\u00A8\u00A9\u00AA\u00AB\u00AC\u00AE\u00AF\u00B0\u00B1\u00B2\u00B3\u00B4\u00B5\u00B6\u00B7\u00B8\u00B9\u00BA\u00BB\u00BC\u00BD\u00BE\u00BF\u00C0\u00C1\u00C2\u00C3\u00C4\u00C5\u00C6\u00C7\u00C8\u00C9\u00CA\u00CB\u00CC\u00CD\u00CE\u00CF\u00D0\u00D1\u00D2\u00D3\u00D4\u00D5\u00D6\u00D7\u00D8\u00D9\u00DA\u00DB\u00DC\u00DD\u00DE\u00DF\u00E0\u00E1\u00E2\u00E3\u00E4\u00E5\u00E6\u00E7\u00E8\u00E9\u00EA\u00EB\u00EC\u00ED\u00EE\u00EF\u00F0\u00F1\u00F2\u00F3\u00F4\u00F5\u00F6\u00F7\u00F8\u00F9\u00FA\u00FB\u00FC\u00FD\u00FE\u00FF'),
            sha1: 'ca4a426a3d536f14cfd79011e79e10d64de950a0',
            md5: 'e8098ec21950f841731d28749129d3ee',
        },
        {
            input: (0, v35_js_1.stringToBytes)('\u00A5\u0104\u018F\u0256\u02B1o\u0315\u038E\u0409\u0500\u0531\u05E1\u05B6\u0920\u0903\u09A4\u0983\u0A20\u0A02\u0AA0\u0A83\u0B06\u0C05\u0C03\u1401\u16A0'),
            sha1: 'f2753ebc390e5f637e333c2a4179644a93ae9f65',
            md5: '231b309e277b6be8bb3d6c688b7f098b',
        },
    ];
    function hashToHex(hash) {
        const chars = new Array(hash.length);
        for (let i = 0; i < hash.length; i++) {
            chars[i] = hash[i].toString(16).padStart(2, '0');
        }
        return chars.join('');
    }
    HASH_SAMPLES.forEach(function (sample, i) {
        (0, node_test_1.default)(`sha1(node) HASH_SAMPLES[${i}]`, () => {
            assert.equal(hashToHex((0, sha1_js_1.default)(sample.input)), sample.sha1);
        });
    });
    HASH_SAMPLES.forEach(function (sample, i) {
        (0, node_test_1.default)(`md5(node) HASH_SAMPLES[${i}]`, () => {
            assert.equal(hashToHex((0, md5_js_1.default)(sample.input)), sample.md5);
        });
    });
    (0, node_test_1.default)('v3', () => {
        assert.strictEqual((0, v3_js_1.default)('hello.example.com', v3_js_1.default.DNS), '9125a8dc-52ee-365b-a5aa-81b0b3681cf6');
        assert.strictEqual((0, v3_js_1.default)('http://example.com/hello', v3_js_1.default.URL), 'c6235813-3ba4-3801-ae84-e0a6ebb7d138');
        assert.strictEqual((0, v3_js_1.default)('hello', '0f5abcd1-c194-47f3-905b-2df7263a084b'), 'a981a0c2-68b1-35dc-bcfc-296e52ab01ec');
    });
    (0, node_test_1.default)('v3 namespace.toUpperCase', () => {
        assert.strictEqual((0, v3_js_1.default)('hello.example.com', v3_js_1.default.DNS.toUpperCase()), '9125a8dc-52ee-365b-a5aa-81b0b3681cf6');
        assert.strictEqual((0, v3_js_1.default)('http://example.com/hello', v3_js_1.default.URL.toUpperCase()), 'c6235813-3ba4-3801-ae84-e0a6ebb7d138');
        assert.strictEqual((0, v3_js_1.default)('hello', '0f5abcd1-c194-47f3-905b-2df7263a084b'.toUpperCase()), 'a981a0c2-68b1-35dc-bcfc-296e52ab01ec');
    });
    (0, node_test_1.default)('v3 namespace string validation', () => {
        assert.throws(() => {
            (0, v3_js_1.default)('hello.example.com', 'zyxwvuts-rqpo-nmlk-jihg-fedcba000000');
        });
        assert.throws(() => {
            (0, v3_js_1.default)('hello.example.com', 'invalid uuid value');
        });
        assert.ok((0, v3_js_1.default)('hello.example.com', '00000000-0000-0000-0000-000000000000'));
    });
    (0, node_test_1.default)('v3 namespace buffer validation', () => {
        assert.throws(() => {
            (0, v3_js_1.default)('hello.example.com', new Uint8Array(15));
        });
        assert.throws(() => {
            (0, v3_js_1.default)('hello.example.com', new Uint8Array(17));
        });
        assert.ok((0, v3_js_1.default)('hello.example.com', new Uint8Array(16).fill(0)));
    });
    (0, node_test_1.default)('v3 fill buffer', () => {
        let buf = new Uint8Array(16);
        const expectedUuid = Uint8Array.of(0x91, 0x25, 0xa8, 0xdc, 0x52, 0xee, 0x36, 0x5b, 0xa5, 0xaa, 0x81, 0xb0, 0xb3, 0x68, 0x1c, 0xf6);
        const result = (0, v3_js_1.default)('hello.example.com', v3_js_1.default.DNS, buf);
        assert.deepEqual(buf, expectedUuid);
        assert.strictEqual(result, buf);
        buf = new Uint8Array(19).fill(0xaa);
        const expectedBuf = new Uint8Array(19).fill(0xaa);
        expectedBuf.set(expectedUuid, 3);
        (0, v3_js_1.default)('hello.example.com', v3_js_1.default.DNS, buf, 3);
        assert.deepEqual(buf, expectedBuf);
    });
    (0, node_test_1.default)('v3 undefined/null', () => {
        assert.throws(() => (0, v3_js_1.default)());
        assert.throws(() => (0, v3_js_1.default)('hello'));
        assert.throws(() => (0, v3_js_1.default)('hello.example.com', undefined));
        assert.throws(() => (0, v3_js_1.default)('hello.example.com', null, new Uint8Array(16)));
    });
    (0, node_test_1.default)('v5', () => {
        assert.strictEqual((0, v5_js_1.default)('hello.example.com', v5_js_1.default.DNS), 'fdda765f-fc57-5604-a269-52a7df8164ec');
        assert.strictEqual((0, v5_js_1.default)('http://example.com/hello', v5_js_1.default.URL), '3bbcee75-cecc-5b56-8031-b6641c1ed1f1');
        assert.strictEqual((0, v5_js_1.default)('hello', '0f5abcd1-c194-47f3-905b-2df7263a084b'), '90123e1c-7512-523e-bb28-76fab9f2f73d');
    });
    (0, node_test_1.default)('v5 namespace.toUpperCase', () => {
        assert.strictEqual((0, v5_js_1.default)('hello.example.com', v5_js_1.default.DNS.toUpperCase()), 'fdda765f-fc57-5604-a269-52a7df8164ec');
        assert.strictEqual((0, v5_js_1.default)('http://example.com/hello', v5_js_1.default.URL.toUpperCase()), '3bbcee75-cecc-5b56-8031-b6641c1ed1f1');
        assert.strictEqual((0, v5_js_1.default)('hello', '0f5abcd1-c194-47f3-905b-2df7263a084b'.toUpperCase()), '90123e1c-7512-523e-bb28-76fab9f2f73d');
    });
    (0, node_test_1.default)('v5 namespace string validation', () => {
        assert.throws(() => {
            (0, v5_js_1.default)('hello.example.com', 'zyxwvuts-rqpo-nmlk-jihg-fedcba000000');
        });
        assert.throws(() => {
            (0, v5_js_1.default)('hello.example.com', 'invalid uuid value');
        });
        assert.ok((0, v5_js_1.default)('hello.example.com', '00000000-0000-0000-0000-000000000000'));
    });
    (0, node_test_1.default)('v5 namespace buffer validation', () => {
        assert.throws(() => {
            (0, v5_js_1.default)('hello.example.com', new Uint8Array(15));
        });
        assert.throws(() => {
            (0, v5_js_1.default)('hello.example.com', new Uint8Array(17));
        });
        assert.ok((0, v5_js_1.default)('hello.example.com', new Uint8Array(16).fill(0)));
    });
    (0, node_test_1.default)('v5 fill buffer', () => {
        let buf = new Uint8Array(16);
        const expectedUuid = Uint8Array.of(0xfd, 0xda, 0x76, 0x5f, 0xfc, 0x57, 0x56, 0x04, 0xa2, 0x69, 0x52, 0xa7, 0xdf, 0x81, 0x64, 0xec);
        const result = (0, v5_js_1.default)('hello.example.com', v5_js_1.default.DNS, buf);
        assert.deepEqual(buf, expectedUuid);
        assert.strictEqual(result, buf);
        buf = new Uint8Array(19).fill(0xaa);
        const expectedBuf = new Uint8Array(19).fill(0xaa);
        expectedBuf.set(expectedUuid, 3);
        (0, v5_js_1.default)('hello.example.com', v5_js_1.default.DNS, buf, 3);
        assert.deepEqual(buf, expectedBuf);
    });
    (0, node_test_1.default)('v5 undefined/null', () => {
        assert.throws(() => (0, v5_js_1.default)());
        assert.throws(() => (0, v5_js_1.default)('hello'));
        assert.throws(() => (0, v5_js_1.default)('hello.example.com', undefined));
        assert.throws(() => (0, v5_js_1.default)('hello.example.com', null, new Uint8Array(16)));
    });
    (0, node_test_1.default)('v3/v5 constants', () => {
        assert.strictEqual(v3_js_1.default.DNS, '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
        assert.strictEqual(v3_js_1.default.URL, '6ba7b811-9dad-11d1-80b4-00c04fd430c8');
        assert.strictEqual(v5_js_1.default.DNS, '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
        assert.strictEqual(v5_js_1.default.URL, '6ba7b811-9dad-11d1-80b4-00c04fd430c8');
    });
});
