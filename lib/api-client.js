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
const octokit = __importStar(require("@octokit/rest"));
const console_log_level_1 = __importDefault(require("console-log-level"));
const githubAPIURL = process.env["GITHUB_API_URL"] || "https://api.github.com";
exports.client = new octokit.Octokit({
    auth: core.getInput("token"),
    baseUrl: githubAPIURL,
    userAgent: "CodeQL Action",
    log: console_log_level_1.default({ level: "debug" })
});
//# sourceMappingURL=api-client.js.map