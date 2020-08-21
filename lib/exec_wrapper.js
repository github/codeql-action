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
async function exec_wrapper(commandLine, args, options) {
    var _a;
    const originalListener = (_a = options) === null || _a === void 0 ? void 0 : _a.listeners;
    let stdout = '';
    let stderr = '';
    let listeners = {
        stdout: (data) => {
            var _a, _b, _c;
            stdout += data.toString();
            // NB change behaviour to only write to stdout/err if no listener passed
            process.stdout.write(data);
            (_c = (_a = originalListener) === null || _a === void 0 ? void 0 : (_b = _a).stdout) === null || _c === void 0 ? void 0 : _c.call(_b, data);
        },
        stderr: (data) => {
            var _a, _b, _c;
            stderr += data.toString();
            process.stderr.write(data);
            (_c = (_a = originalListener) === null || _a === void 0 ? void 0 : (_b = _a).stderr) === null || _c === void 0 ? void 0 : _c.call(_b, data);
        }
    };
    const returnCode = await exec.exec(commandLine, args, {
        listeners: listeners,
        ...options
    });
    if (stderr === stdout) {
        console.log('foo bar');
    }
    return returnCode;
}
exports.exec_wrapper = exec_wrapper;
//# sourceMappingURL=exec_wrapper.js.map