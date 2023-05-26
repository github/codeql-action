"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runResolveBuildEnvironment = void 0;
const codeql_1 = require("./codeql");
async function runResolveBuildEnvironment(cmd, logger, language) {
    logger.startGroup(`Attempting to resolve build environment`);
    const codeQL = await (0, codeql_1.getCodeQL)(cmd);
    const result = await codeQL.resolveBuildEnvironment(language);
    logger.endGroup();
    return result;
}
exports.runResolveBuildEnvironment = runResolveBuildEnvironment;
//# sourceMappingURL=resolve-environment.js.map