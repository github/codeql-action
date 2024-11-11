import * as assert from 'assert';
import test, { describe } from 'node:test';
import parse from '../parse.js';
import v1, { updateV1State } from '../v1.js';
const TIME = 1321644961388;
const RFC_V1 = 'c232ab00-9414-11ec-b3c8-9f68deced846';
const RFC_V1_BYTES = parse(RFC_V1);
const RFC_OPTIONS = {
    msecs: 0x17f22e279b0,
    nsecs: 0,
    clockseq: 0x33c8,
    node: Uint8Array.of(0x9f, 0x68, 0xde, 0xce, 0xd8, 0x46),
};
const RFC_RANDOM = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, RFC_OPTIONS.clockseq >> 8, RFC_OPTIONS.clockseq & 0xff, ...RFC_OPTIONS.node);
function compareV1TimeField(a, b) {
    a = a.split('-').slice(0, 3).reverse().join('');
    b = b.split('-').slice(0, 3).reverse().join('');
    return a < b ? -1 : a > b ? 1 : 0;
}
describe('v1', () => {
    test('v1 sort order (default)', () => {
        const ids = [v1(), v1(), v1(), v1(), v1()];
        const sorted = [...ids].sort(compareV1TimeField);
        assert.deepEqual(ids, sorted);
    });
    test('v1 sort order (time option)', () => {
        const ids = [
            v1({ msecs: TIME - 10 * 3600 * 1000 }),
            v1({ msecs: TIME - 1 }),
            v1({ msecs: TIME }),
            v1({ msecs: TIME + 1 }),
            v1({ msecs: TIME + 28 * 24 * 3600 * 1000 }),
        ];
        const sorted = [...ids].sort(compareV1TimeField);
        assert.deepEqual(ids, sorted);
    });
    test('v1(options)', () => {
        assert.equal(v1({ msecs: RFC_OPTIONS.msecs, random: RFC_RANDOM }), RFC_V1, 'minimal options');
        assert.equal(v1(RFC_OPTIONS), RFC_V1, 'full options');
    });
    test('v1(options) equality', () => {
        assert.notEqual(v1({ msecs: TIME }), v1({ msecs: TIME }), 'UUIDs with minimal options differ');
        assert.equal(v1(RFC_OPTIONS), v1(RFC_OPTIONS), 'UUIDs with full options are identical');
    });
    test('fills one UUID into a buffer as expected', () => {
        const buffer = new Uint8Array(16);
        const result = v1(RFC_OPTIONS, buffer);
        assert.deepEqual(buffer, RFC_V1_BYTES);
        assert.strictEqual(buffer, result);
    });
    test('fills two UUIDs into a buffer as expected', () => {
        const buffer = new Uint8Array(32);
        v1(RFC_OPTIONS, buffer, 0);
        v1(RFC_OPTIONS, buffer, 16);
        const expectedBuf = new Uint8Array(32);
        expectedBuf.set(RFC_V1_BYTES);
        expectedBuf.set(RFC_V1_BYTES, 16);
        assert.deepEqual(buffer, expectedBuf);
    });
    test('v1() state transitions', () => {
        const PRE_STATE = {
            msecs: 10,
            nsecs: 20,
            clockseq: 0x1234,
            node: Uint8Array.of(0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc),
        };
        const tests = [
            {
                title: 'initial state',
                state: {},
                now: 10,
                expected: {
                    msecs: 10,
                    nsecs: 0,
                    clockseq: RFC_OPTIONS.clockseq,
                    node: RFC_OPTIONS.node,
                },
            },
            {
                title: 'same time interval',
                state: { ...PRE_STATE },
                now: PRE_STATE.msecs,
                expected: {
                    ...PRE_STATE,
                    nsecs: 21,
                },
            },
            {
                title: 'new time interval',
                state: { ...PRE_STATE },
                now: PRE_STATE.msecs + 1,
                expected: {
                    ...PRE_STATE,
                    msecs: PRE_STATE.msecs + 1,
                    nsecs: 0,
                },
            },
            {
                title: 'same time interval (nsecs overflow)',
                state: { ...PRE_STATE, nsecs: 9999 },
                now: PRE_STATE.msecs,
                expected: {
                    ...PRE_STATE,
                    nsecs: 0,
                    clockseq: RFC_OPTIONS.clockseq,
                    node: RFC_OPTIONS.node,
                },
            },
            {
                title: 'time regression',
                state: { ...PRE_STATE },
                now: PRE_STATE.msecs - 1,
                expected: {
                    ...PRE_STATE,
                    msecs: PRE_STATE.msecs - 1,
                    clockseq: RFC_OPTIONS.clockseq,
                    node: RFC_OPTIONS.node,
                },
            },
        ];
        for (const { title, state, now, expected } of tests) {
            assert.deepStrictEqual(updateV1State(state, now, RFC_RANDOM), expected, `Failed: ${title}`);
        }
    });
});
