"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolrunnerErrorCatcher = void 0;
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const safeWhich = __importStar(require("@chrisgavin/safe-which"));
/**
 * Wrapper for toolrunner.Toolrunner which checks for specific return code and/or regex matches in console output.
 * Output will be streamed to the live console as well as captured for subsequent processing.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     matchers           defines specific codes and/or regexes that should lead to return of a custom error
 * @param     options            optional exec options.  See ExecOptions
 * @returns   Promise<number>    exit code
 */
async function toolrunnerErrorCatcher(commandLine, args, matchers, options) {
    var _a, _b;
    let stdout = "";
    let stderr = "";
    const listeners = {
        stdout: (data) => {
            var _a;
            stdout += data.toString();
            if (((_a = options === null || options === void 0 ? void 0 : options.listeners) === null || _a === void 0 ? void 0 : _a.stdout) !== undefined) {
                options.listeners.stdout(data);
            }
            else {
                // if no stdout listener was originally defined then we match default behavior of Toolrunner
                process.stdout.write(data);
            }
        },
        stderr: (data) => {
            var _a;
            stderr += data.toString();
            if (((_a = options === null || options === void 0 ? void 0 : options.listeners) === null || _a === void 0 ? void 0 : _a.stderr) !== undefined) {
                options.listeners.stderr(data);
            }
            else {
                // if no stderr listener was originally defined then we match default behavior of Toolrunner
                process.stderr.write(data);
            }
        },
    };
    // we capture the original return code or error so that if no match is found we can duplicate the behavior
    let returnState;
    try {
        returnState = await new toolrunner.ToolRunner(await safeWhich.safeWhich(commandLine), args, {
            ...options,
            listeners,
            ignoreReturnCode: true, // so we can check for specific codes using the matchers
        }).exec();
    }
    catch (e) {
        returnState = e;
    }
    // if there is a zero return code then we do not apply the matchers
    if (returnState === 0)
        return returnState;
    if (matchers) {
        for (const matcher of matchers) {
            if (matcher.exitCode === returnState ||
                ((_a = matcher.outputRegex) === null || _a === void 0 ? void 0 : _a.test(stderr)) ||
                ((_b = matcher.outputRegex) === null || _b === void 0 ? void 0 : _b.test(stdout))) {
                throw new Error(matcher.message);
            }
        }
    }
    if (typeof returnState === "number") {
        // only if we were instructed to ignore the return code do we ever return it non-zero
        if (options === null || options === void 0 ? void 0 : options.ignoreReturnCode) {
            return returnState;
        }
        else {
            throw new Error(`The process '${commandLine}' failed with exit code ${returnState}`);
        }
    }
    else {
        throw returnState;
    }
}
exports.toolrunnerErrorCatcher = toolrunnerErrorCatcher;
//# sourceMappingURL=toolrunner-error-catcher.js.map