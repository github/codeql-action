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
exports.getRetryOptions = void 0;
const core = __importStar(require("@actions/core"));
// Defaults for fetching artifacts
const defaultMaxRetryNumber = 5;
const defaultExemptStatusCodes = [400, 401, 403, 404, 422]; // https://github.com/octokit/plugin-retry.js/blob/9a2443746c350b3beedec35cf26e197ea318a261/src/index.ts#L14
function getRetryOptions(defaultOptions, retries = defaultMaxRetryNumber, exemptStatusCodes = defaultExemptStatusCodes) {
    var _a;
    if (retries <= 0) {
        return [{ enabled: false }, defaultOptions.request];
    }
    const retryOptions = {
        enabled: true
    };
    if (exemptStatusCodes.length > 0) {
        retryOptions.doNotRetry = exemptStatusCodes;
    }
    // The GitHub type has some defaults for `options.request`
    // see: https://github.com/actions/toolkit/blob/4fbc5c941a57249b19562015edbd72add14be93d/packages/github/src/utils.ts#L15
    // We pass these in here so they are not overridden.
    const requestOptions = Object.assign(Object.assign({}, defaultOptions.request), { retries });
    core.debug(`GitHub client configured with: (retries: ${requestOptions.retries}, retry-exempt-status-code: ${(_a = retryOptions.doNotRetry) !== null && _a !== void 0 ? _a : 'octokit default: [400, 401, 403, 404, 422]'})`);
    return [retryOptions, requestOptions];
}
exports.getRetryOptions = getRetryOptions;
//# sourceMappingURL=retry-options.js.map