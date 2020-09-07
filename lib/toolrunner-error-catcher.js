"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const toolrunnner = __importStar(require("@actions/exec/lib/toolrunner"));
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
async function toolrunnerErrorCatcher(commandLine, args, matchers, options) {
    var _a;
    let stdout = '';
    let stderr = '';
    let listeners = {
        stdout: (data) => {
            var _a, _b;
            stdout += data.toString();
            if (((_b = (_a = options) === null || _a === void 0 ? void 0 : _a.listeners) === null || _b === void 0 ? void 0 : _b.stdout) !== undefined) {
                options.listeners.stdout(data);
            }
            else {
                // if no stdout listener was originally defined then we match default behavior of exec.exec
                process.stdout.write(data);
            }
        },
        stderr: (data) => {
            var _a, _b;
            stderr += data.toString();
            if (((_b = (_a = options) === null || _a === void 0 ? void 0 : _a.listeners) === null || _b === void 0 ? void 0 : _b.stderr) !== undefined) {
                options.listeners.stderr(data);
            }
            else {
                // if no stderr listener was originally defined then we match default behavior of exec.exec
                process.stderr.write(data);
            }
        }
    };
    // we capture the original return code or error so that if no match is found we can duplicate the behavior
    let returnState;
    try {
        returnState = await new toolrunnner.ToolRunner(commandLine, args, {
            ...options,
            listeners: listeners,
            ignoreReturnCode: true,
        }).exec();
    }
    catch (e) {
        returnState = e;
    }
    // if there is a zero return code then we do not apply the matchers
    if (returnState === 0)
        return returnState;
    if (matchers) {
        for (const [customCode, regex, message] of matchers) {
            if (customCode === returnState || regex && (regex.test(stderr) || regex.test(stdout))) {
                throw new Error(message);
            }
        }
    }
    if (typeof returnState === 'number') {
        // only if we were instructed to ignore the return code do we ever return it non-zero
        if ((_a = options) === null || _a === void 0 ? void 0 : _a.ignoreReturnCode) {
            return returnState;
        }
        else {
            throw new Error(`The process \'${commandLine}\' failed with exit code ${returnState}`);
        }
    }
    else {
        throw returnState;
    }
}
exports.toolrunnerErrorCatcher = toolrunnerErrorCatcher;
//# sourceMappingURL=toolrunner-error-catcher.js.map