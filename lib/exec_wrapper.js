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