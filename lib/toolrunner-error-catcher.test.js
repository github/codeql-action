"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const exec = __importStar(require("@actions/exec"));
const toolrunnner = __importStar(require("@actions/exec/lib/toolrunner"));
const ava_1 = __importDefault(require("ava"));
const testing_utils_1 = require("./testing-utils");
const toolrunner_error_catcher_1 = require("./toolrunner-error-catcher");
testing_utils_1.setupTests(ava_1.default);
ava_1.default('matchers are never applied if non-error exit', async (t) => {
    const testArgs = buildDummyArgs("foo bar\\nblort qux", "foo bar\\nblort qux", '', 0);
    const matchers = [[123, new RegExp("foo bar"), 'error!!!']];
    t.deepEqual(await exec.exec('node', testArgs), 0);
    t.deepEqual(await toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, matchers), 0);
});
ava_1.default('regex matchers are applied to stdout for non-zero exit code', async (t) => {
    const testArgs = buildDummyArgs("foo bar\\nblort qux", '', '', 1);
    const matchers = [[123, new RegExp("foo bar"), '🦄']];
    await t.throwsAsync(exec.exec('node', testArgs), { instanceOf: Error, message: 'The process \'node\' failed with exit code 1' });
    await t.throwsAsync(toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, matchers), { instanceOf: Error, message: '🦄' });
});
ava_1.default('regex matchers are applied to stderr for non-zero exit code', async (t) => {
    const testArgs = buildDummyArgs("non matching string", 'foo bar\\nblort qux', '', 1);
    const matchers = [[123, new RegExp("foo bar"), '🦄']];
    await t.throwsAsync(exec.exec('node', testArgs), { instanceOf: Error, message: 'The process \'node\' failed with exit code 1' });
    await t.throwsAsync(toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, matchers), { instanceOf: Error, message: '🦄' });
});
ava_1.default('matcher returns correct error message when multiple matchers defined', async (t) => {
    const testArgs = buildDummyArgs("non matching string", 'foo bar\\nblort qux', '', 1);
    const matchers = [[456, new RegExp("lorem ipsum"), '😩'],
        [123, new RegExp("foo bar"), '🦄'],
        [789, new RegExp("blah blah"), '🤦‍♂️']];
    await t.throwsAsync(exec.exec('node', testArgs), { instanceOf: Error, message: 'The process \'node\' failed with exit code 1' });
    await t.throwsAsync(toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, matchers), { instanceOf: Error, message: '🦄' });
});
ava_1.default('matcher returns first match to regex when multiple matches', async (t) => {
    const testArgs = buildDummyArgs("non matching string", 'foo bar\\nblort qux', '', 1);
    const matchers = [[123, new RegExp("foo bar"), '🦄'],
        [789, new RegExp("blah blah"), '🤦‍♂️'],
        [987, new RegExp("foo bar"), '🚫']];
    await t.throwsAsync(exec.exec('node', testArgs), { instanceOf: Error, message: 'The process \'node\' failed with exit code 1' });
    await t.throwsAsync(toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, matchers), { instanceOf: Error, message: '🦄' });
});
ava_1.default('exit code matchers are applied', async (t) => {
    const testArgs = buildDummyArgs("non matching string", 'foo bar\\nblort qux', '', 123);
    const matchers = [[123, new RegExp("this will not match"), '🦄']];
    await t.throwsAsync(exec.exec('node', testArgs), { instanceOf: Error, message: 'The process \'node\' failed with exit code 123' });
    await t.throwsAsync(toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, matchers), { instanceOf: Error, message: '🦄' });
});
ava_1.default('execErrorCatcher respects the ignoreReturnValue option', async (t) => {
    const testArgs = buildDummyArgs("standard output", 'error output', '', 199);
    await t.throwsAsync(toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, [], { ignoreReturnCode: false }), { instanceOf: Error });
    t.deepEqual(await toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, [], { ignoreReturnCode: true }), 199);
});
ava_1.default('execErrorCatcher preserves behavior of provided listeners', async (t) => {
    let stdoutExpected = 'standard output';
    let stderrExpected = 'error output';
    let stdoutActual = '';
    let stderrActual = '';
    let listeners = {
        stdout: (data) => {
            stdoutActual += data.toString();
        },
        stderr: (data) => {
            stderrActual += data.toString();
        }
    };
    const testArgs = buildDummyArgs(stdoutExpected, stderrExpected, '', 0);
    t.deepEqual(await toolrunner_error_catcher_1.toolrunnerErrorCatcher('node', testArgs, [], { listeners: listeners }), 0);
    t.deepEqual(stdoutActual, stdoutExpected + "\n");
    t.deepEqual(stderrActual, stderrExpected + "\n");
});
function buildDummyArgs(stdoutContents, stderrContents, desiredErrorMessage, desiredExitCode) {
    let command = '';
    if (stdoutContents)
        command += 'console.log(\\"' + stdoutContents + '\\");';
    if (stderrContents)
        command += 'console.error(\\"' + stderrContents + '\\");';
    if (command.length === 0)
        throw new Error("Must provide contents for either stdout or stderr");
    if (desiredErrorMessage)
        command += 'throw new Error(\\"' + desiredErrorMessage + '\\");';
    if (desiredExitCode)
        command += 'process.exitCode = ' + desiredExitCode + ';';
    return toolrunnner.argStringToArray('-e "' + command + '"');
}
//# sourceMappingURL=toolrunner-error-catcher.test.js.map