"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runResolveBuildEnvironment = runResolveBuildEnvironment;
const codeql_1 = require("./codeql");
async function runResolveBuildEnvironment(cmd, logger, workingDir, language) {
    logger.startGroup(`Attempting to resolve build environment for ${language}`);
    const codeql = await (0, codeql_1.getCodeQL)(cmd);
    if (workingDir !== undefined) {
        logger.info(`Using ${workingDir} as the working directory.`);
    }
    const result = await codeql.resolveBuildEnvironment(workingDir, language);
    logger.endGroup();
    return result;
}
//# sourceMappingURL=resolve-environment.js.map