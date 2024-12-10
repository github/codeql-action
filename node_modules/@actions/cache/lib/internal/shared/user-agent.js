"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserAgentString = void 0;
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const packageJson = require('../../../package.json');
/**
 * Ensure that this User Agent String is used in all HTTP calls so that we can monitor telemetry between different versions of this package
 */
function getUserAgentString() {
    return `@actions/cache-${packageJson.version}`;
}
exports.getUserAgentString = getUserAgentString;
//# sourceMappingURL=user-agent.js.map