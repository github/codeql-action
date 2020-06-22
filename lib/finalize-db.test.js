"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const os = __importStar(require("os"));
const finalize_db_1 = require("./finalize-db");
ava_1.default('getMemoryFlag() should return the correct --ram flag', t => {
    const totalMem = os.totalmem() / (1024 * 1024);
    const tests = {
        "": `--ram=${totalMem - 256}`,
        "512": "--ram=512",
    };
    for (const [input, expectedFlag] of Object.entries(tests)) {
        process.env['INPUT_RAM'] = input;
        const flag = finalize_db_1.getMemoryFlag();
        t.deepEqual(flag, expectedFlag);
    }
});
ava_1.default('getMemoryFlag() throws if the ram input is < 0 or NaN', t => {
    for (const input of ["-1", "hello!"]) {
        process.env['INPUT_RAM'] = input;
        t.throws(finalize_db_1.getMemoryFlag);
    }
});
ava_1.default('getThreadsFlag() should return the correct --threads flag', t => {
    const numCpus = os.cpus().length;
    const tests = {
        "0": "--threads=0",
        "1": "--threads=1",
        [`${numCpus + 1}`]: `--threads=${numCpus}`
    };
    for (const [input, expectedFlag] of Object.entries(tests)) {
        process.env['INPUT_THREADS'] = input;
        const flag = finalize_db_1.getThreadsFlag();
        t.deepEqual(flag, expectedFlag);
    }
});
ava_1.default('getThreadsFlag() throws if the ram input is < 0 or NaN', t => {
    for (const input of ["-1", "hello!"]) {
        process.env['INPUT_THREADS'] = input;
        t.throws(finalize_db_1.getThreadsFlag);
    }
});
//# sourceMappingURL=finalize-db.test.js.map