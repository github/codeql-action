"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ava_1 = __importDefault(require("ava"));
const api_client_1 = require("./api-client");
const environment_1 = require("./environment");
const testing_utils_1 = require("./testing-utils");
const util_1 = require("./util");
(0, testing_utils_1.setupTests)(ava_1.default);
(0, ava_1.default)("computeAutomationID()", async (t) => {
    let actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"language": "javascript", "os": "linux"}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/");
    // check the environment sorting
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"os": "linux", "language": "javascript"}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/");
    // check that an empty environment produces the right results
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", "{}");
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/");
    // check non string environment values
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", '{"number": 1, "object": {"language": "javascript"}}');
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/number:/object:/");
    // check undefined environment
    actualAutomationID = (0, api_client_1.computeAutomationID)(".github/workflows/codeql-analysis.yml:analyze", undefined);
    t.deepEqual(actualAutomationID, ".github/workflows/codeql-analysis.yml:analyze/");
});
(0, ava_1.default)("initializeEnvironment", (t) => {
    (0, util_1.initializeEnvironment)("1.2.3");
    t.deepEqual(process.env[environment_1.EnvVar.VERSION], "1.2.3");
});
//# sourceMappingURL=actions-util.test.js.map