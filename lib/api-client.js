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
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const console_log_level_1 = __importDefault(require("console-log-level"));
exports.getApiClient = function () {
    return new github.GitHub(core.getInput('token'), {
        userAgent: "CodeQL Action",
        log: console_log_level_1.default({ level: "debug" })
    });
};
//# sourceMappingURL=api-client.js.map