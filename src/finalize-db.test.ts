import test from "ava";
import * as os from "os";

import {
    getMemoryFlag,
    getThreadsFlag
} from "./finalize-db";

test('getMemoryFlag() should return the correct --ram flag', t => {

    const totalMem = os.totalmem() / (1024 * 1024);

    const tests = {
        "": `--ram=${totalMem - 256}`,
        "512": "--ram=512",
    };

    for (const [input, expectedFlag] of Object.entries(tests)) {

        process.env['INPUT_RAM'] = input;

        const flag = getMemoryFlag();
        t.deepEqual(flag, expectedFlag);
    }
});

test('getMemoryFlag() throws if the ram input is < 0 or NaN', t => {
    for (const input of ["-1", "hello!"]) {
        process.env['INPUT_RAM'] = input;
        t.throws(getMemoryFlag);
    }
});

test('getThreadsFlag() should return the correct --threads flag', t => {

    const numCpus = os.cpus().length;

    const tests = {
        "0": "--threads=0",
        "1": "--threads=1",
        [`${numCpus + 1}`]: `--threads=${numCpus}`
    };

    for (const [input, expectedFlag] of Object.entries(tests)) {

        process.env['INPUT_THREADS'] = input;

        const flag = getThreadsFlag();
        t.deepEqual(flag, expectedFlag);
    }
});

test('getThreadsFlag() throws if the ram input is < 0 or NaN', t => {
    for (const input of ["-1", "hello!"]) {
        process.env['INPUT_THREADS'] = input;
        t.throws(getThreadsFlag);
    }
});
