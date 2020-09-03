"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const exec = __importStar(require("@actions/exec"));
/**
 * Wrapper for exec.exec which checks for specific return code and/or regex matches in console output.
 * Output will be streamed to the live console as well as captured for subsequent processing.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute (can include additional args). Must be correctly escaped.
 * @param     matchers           defines specific codes and/or regexes that should lead to return of a custom error
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     options            optional exec options.  See ExecOptions
 * @returns   Promise<number>    exit code
 */
async function exec_wrapper(commandLine, args, matchers, options) {
    var _a;
    let stdout = '';
    let stderr = '';
    // custom listeners to store stdout and stderr, while also replicating the behaviour of the passed listeners
    const originalListener = (_a = options) === null || _a === void 0 ? void 0 : _a.listeners;
    let listeners = {
        stdout: (data) => {
            var _a;
            stdout += data.toString();
            if (((_a = originalListener) === null || _a === void 0 ? void 0 : _a.stdout) !== undefined) {
                originalListener.stdout(data);
            }
            else {
                // if no stdout listener was originally defined then match behaviour of exec.exec
                process.stdout.write(data);
            }
        },
        stderr: (data) => {
            var _a;
            stderr += data.toString();
            if (((_a = originalListener) === null || _a === void 0 ? void 0 : _a.stderr) !== undefined) {
                originalListener.stderr(data);
            }
            else {
                // if no stderr listener was originally defined then match behaviour of exec.exec
                process.stderr.write(data);
            }
        }
    };
    // we capture the original return code and error so that (if no match is found) we can duplicate the behaviour
    let originalReturnValue;
    try {
        originalReturnValue = await exec.exec(commandLine, args, {
            listeners: listeners,
            ...options
        });
    }
    catch (e) {
        originalReturnValue = e;
    }
    if (matchers && originalReturnValue !== 0) {
        for (const [customCode, regex, message] of matchers) {
            if (customCode === originalReturnValue || regex.test(stderr) || regex.test(stdout)) {
                throw new Error(message);
            }
        }
    }
    if (typeof originalReturnValue === 'number') {
        return originalReturnValue;
    }
    else {
        throw originalReturnValue;
    }
}
exports.exec_wrapper = exec_wrapper;
//# sourceMappingURL=exec_wrapper.js.map