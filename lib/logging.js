"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
function getActionsLogger() {
    return core;
}
exports.getActionsLogger = getActionsLogger;
function getCLILogger() {
    return {
        debug: console.debug,
        info: console.info,
        warning: console.warn,
        error: console.error,
        startGroup: () => undefined,
        endGroup: () => undefined,
    };
}
exports.getCLILogger = getCLILogger;
//# sourceMappingURL=logging.js.map