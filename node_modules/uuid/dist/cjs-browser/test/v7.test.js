"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const node_test_1 = require("node:test");
const parse_js_1 = require("../parse.js");
const stringify_js_1 = require("../stringify.js");
const v7_js_1 = require("../v7.js");
const RFC_V7 = '017f22e2-79b0-7cc3-98c4-dc0c0c07398f';
const RFC_V7_BYTES = (0, parse_js_1.default)('017f22e2-79b0-7cc3-98c4-dc0c0c07398f');
const RFC_MSECS = 0x17f22e279b0;
const RFC_SEQ = (0x0cc3 << 20) | (0x98c4dc >> 2);
const RFC_RANDOM = Uint8Array.of(0x10, 0x91, 0x56, 0xbe, 0xc4, 0xfb, 0x0c, 0xc3, 0x18, 0xc4, 0x6c, 0x0c, 0x0c, 0x07, 0x39, 0x8f);
(0, node_test_1.describe)('v7', () => {
    (0, node_test_1.default)('subsequent UUIDs are different', () => {
        const id1 = (0, v7_js_1.default)();
        const id2 = (0, v7_js_1.default)();
        assert.ok(id1 !== id2);
    });
    (0, node_test_1.default)('explicit options.random and options.msecs produces expected result', () => {
        const id = (0, v7_js_1.default)({
            random: RFC_RANDOM,
            msecs: RFC_MSECS,
            seq: RFC_SEQ,
        });
        assert.strictEqual(id, RFC_V7);
    });
    (0, node_test_1.default)('explicit options.rng produces expected result', () => {
        const id = (0, v7_js_1.default)({
            rng: () => RFC_RANDOM,
            msecs: RFC_MSECS,
            seq: RFC_SEQ,
        });
        assert.strictEqual(id, RFC_V7);
    });
    (0, node_test_1.default)('explicit options.msecs produces expected result', () => {
        const id = (0, v7_js_1.default)({
            msecs: RFC_MSECS,
        });
        assert.strictEqual(id.indexOf('017f22e2'), 0);
    });
    (0, node_test_1.default)('fills one UUID into a buffer as expected', () => {
        const buffer = new Uint8Array(16);
        const result = (0, v7_js_1.default)({
            random: RFC_RANDOM,
            msecs: RFC_MSECS,
            seq: RFC_SEQ,
        }, buffer);
        (0, stringify_js_1.default)(buffer);
        assert.deepEqual(buffer, RFC_V7_BYTES);
        assert.strictEqual(buffer, result);
    });
    (0, node_test_1.default)('fills two UUIDs into a buffer as expected', () => {
        const buffer = new Uint8Array(32);
        (0, v7_js_1.default)({
            random: RFC_RANDOM,
            msecs: RFC_MSECS,
            seq: RFC_SEQ,
        }, buffer, 0);
        (0, v7_js_1.default)({
            random: RFC_RANDOM,
            msecs: RFC_MSECS,
            seq: RFC_SEQ,
        }, buffer, 16);
        const expected = new Uint8Array(32);
        expected.set(RFC_V7_BYTES);
        expected.set(RFC_V7_BYTES, 16);
        assert.deepEqual(buffer, expected);
    });
    (0, node_test_1.default)('lexicographical sorting is preserved', () => {
        let id;
        let prior;
        let msecs = RFC_MSECS;
        for (let i = 0; i < 20000; ++i) {
            if (i % 1500 === 0) {
                msecs += 1;
            }
            id = (0, v7_js_1.default)({ msecs, seq: i });
            if (prior !== undefined) {
                assert.ok(prior < id, `${prior} < ${id}`);
            }
            prior = id;
        }
    });
    (0, node_test_1.default)('can supply seq', () => {
        let seq = 0x12345;
        let uuid = (0, v7_js_1.default)({
            msecs: RFC_MSECS,
            seq,
        });
        assert.strictEqual(uuid.substr(0, 25), '017f22e2-79b0-7000-848d-1');
        seq = 0x6fffffff;
        uuid = (0, v7_js_1.default)({
            msecs: RFC_MSECS,
            seq,
        });
        assert.strictEqual(uuid.substring(0, 25), '017f22e2-79b0-76ff-bfff-f');
    });
    (0, node_test_1.default)('internal seq is reset upon timestamp change', () => {
        (0, v7_js_1.default)({
            msecs: RFC_MSECS,
            seq: 0x6fffffff,
        });
        const uuid = (0, v7_js_1.default)({
            msecs: RFC_MSECS + 1,
        });
        assert.ok(uuid.indexOf('fff') !== 15);
    });
    (0, node_test_1.default)('v7() state transitions', () => {
        const tests = [
            {
                title: 'new time interval',
                state: { msecs: 1, seq: 123 },
                now: 2,
                expected: {
                    msecs: 2,
                    seq: 0x6c318c4,
                },
            },
            {
                title: 'same time interval',
                state: { msecs: 1, seq: 123 },
                now: 1,
                expected: {
                    msecs: 1,
                    seq: 124,
                },
            },
            {
                title: 'same time interval (sequence rollover)',
                state: { msecs: 1, seq: 0xffffffff },
                now: 1,
                expected: {
                    msecs: 2,
                    seq: 0,
                },
            },
            {
                title: 'time regression',
                state: { msecs: 2, seq: 123 },
                now: 1,
                expected: {
                    msecs: 2,
                    seq: 124,
                },
            },
            {
                title: 'time regression (sequence rollover)',
                state: { msecs: 2, seq: 0xffffffff },
                now: 1,
                expected: {
                    msecs: 3,
                    seq: 0,
                },
            },
        ];
        for (const { title, state, now, expected } of tests) {
            assert.deepStrictEqual((0, v7_js_1.updateV7State)(state, now, RFC_RANDOM), expected, `Failed: ${title}`);
        }
    });
    (0, node_test_1.default)('flipping bits changes the result', () => {
        const asBigInt = (buf) => buf.reduce((acc, v) => (acc << 8n) | BigInt(v), 0n);
        const asNumber = (bits, data) => Number(BigInt.asUintN(bits, data));
        const flip = (data, n) => data ^ (1n << BigInt(127 - n));
        const optionsFrom = (data) => {
            const ms = asNumber(48, data >> 80n);
            const hi = asNumber(12, data >> 64n);
            const lo = asNumber(20, data >> 42n);
            const r = BigInt.asUintN(42, data);
            return {
                msecs: ms,
                seq: (hi << 20) | lo,
                random: Uint8Array.from([
                    ...Array(10).fill(0),
                    ...Array(6)
                        .fill(0)
                        .map((_, i) => asNumber(8, r >> (BigInt(i) * 8n)))
                        .reverse(),
                ]),
            };
        };
        const buf = new Uint8Array(16);
        const data = asBigInt((0, v7_js_1.default)({}, buf));
        const id = (0, stringify_js_1.default)(buf);
        const reserved = [48, 49, 50, 51, 64, 65];
        for (let i = 0; i < 128; ++i) {
            if (reserved.includes(i)) {
                continue;
            }
            const flipped = flip(data, i);
            assert.strictEqual(asBigInt((0, v7_js_1.default)(optionsFrom(flipped), buf)).toString(16), flipped.toString(16), `Unequal uuids at bit ${i}`);
            assert.notStrictEqual((0, stringify_js_1.default)(buf), id);
        }
    });
});
