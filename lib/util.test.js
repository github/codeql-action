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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const util = __importStar(require("./util"));
ava_1.default('getToolNames', t => {
    const input = fs.readFileSync(__dirname + '/../src/testdata/tool-names.sarif', 'utf8');
    const toolNames = util.getToolNames(input);
    t.deepEqual(toolNames, ["CodeQL command-line toolchain", "ESLint"]);
});
ava_1.default('getMemoryFlag() should return the correct --ram flag', t => {
    const totalMem = Math.floor(os.totalmem() / (1024 * 1024));
    const tests = {
        "": `--ram=${totalMem - 256}`,
        "512": "--ram=512",
    };
    for (const [input, expectedFlag] of Object.entries(tests)) {
        process.env['INPUT_RAM'] = input;
        const flag = util.getMemoryFlag();
        t.deepEqual(flag, expectedFlag);
    }
});
ava_1.default('getMemoryFlag() throws if the ram input is < 0 or NaN', t => {
    for (const input of ["-1", "hello!"]) {
        process.env['INPUT_RAM'] = input;
        t.throws(util.getMemoryFlag);
    }
});
ava_1.default('getThreadsFlag() should return the correct --threads flag', t => {
    const numCpus = os.cpus().length;
    const tests = {
        "0": "--threads=0",
        "1": "--threads=1",
        [`${numCpus + 1}`]: `--threads=${numCpus}`,
        [`${-numCpus - 1}`]: `--threads=${-numCpus}`
    };
    for (const [input, expectedFlag] of Object.entries(tests)) {
        process.env['INPUT_THREADS'] = input;
        const flag = util.getThreadsFlag();
        t.deepEqual(flag, expectedFlag);
    }
});
ava_1.default('getThreadsFlag() throws if the ram input is < 0 or NaN', t => {
    for (const input of ["hello!"]) {
        process.env['INPUT_THREADS'] = input;
        t.throws(util.getThreadsFlag);
    }
});
//# sourceMappingURL=util.test.js.map