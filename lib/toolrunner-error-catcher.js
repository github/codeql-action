"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
const util_1 = require("./util");
/**
 * Wrapper for toolrunner.Toolrunner which checks for specific return code and/or regex matches in console output.
 * Output will be streamed to the live console as well as captured for subsequent processing.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     matchers           defines specific codes and/or regexes that should lead to return of a custom error
 * @param     options            optional exec options.  See ExecOptions
 * @returns   ReturnState        exit code and stdout output, if applicable
 */
async function toolrunnerErrorCatcher(commandLine, args, matchers, options) {
    let stdout = "";
    let stderr = "";
    const listeners = {
        stdout: (data) => {
            stdout += data.toString();
            if (options?.listeners?.stdout !== undefined) {
                options.listeners.stdout(data);
            }
        },
        stderr: (data) => {
            stderr += data.toString();
            if (options?.listeners?.stderr !== undefined) {
                options.listeners.stderr(data);
            }
        },
    };
    // we capture the original return code or error so that if no match is found we can duplicate the behavior
    let exitCode;
    try {
        exitCode = await new toolrunner.ToolRunner(await safeWhich.safeWhich(commandLine), args, {
            ...options,
            listeners,
            ignoreReturnCode: true, // so we can check for specific codes using the matchers
        }).exec();
        // if there is a zero return code then we do not apply the matchers
        if (exitCode === 0)
            return { exitCode, stdout };
        if (matchers) {
            for (const matcher of matchers) {
                if (matcher.exitCode === exitCode ||
                    matcher.outputRegex?.test(stderr) ||
                    matcher.outputRegex?.test(stdout)) {
                    throw new Error(matcher.message);
                }
            }
        }
        // only if we were instructed to ignore the return code do we ever return it non-zero
        if (options?.ignoreReturnCode) {
            return { exitCode, stdout };
        }
        else {
            throw new Error(`The process '${commandLine}' failed with exit code ${exitCode}`);
        }
    }
    catch (e) {
        throw (0, util_1.wrapError)(e);
    }
}
exports.toolrunnerErrorCatcher = toolrunnerErrorCatcher;
//# sourceMappingURL=toolrunner-error-catcher.js.map