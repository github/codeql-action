"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const codeql_1 = require("./codeql");
const config_utils = __importStar(require("./config-utils"));
const languages_1 = require("./languages");
async function runAutobuild(language, tmpDir, logger) {
    if (!languages_1.isTracedLanguage(language)) {
        throw new Error(`Cannot build "${language}" as it is not a traced language`);
    }
    const config = await config_utils.getConfig(tmpDir, logger);
    logger.startGroup(`Attempting to automatically build ${language} code`);
    const codeQL = codeql_1.getCodeQL(config.codeQLCmd);
    await codeQL.runAutobuild(language);
    logger.endGroup();
}
exports.runAutobuild = runAutobuild;
//# sourceMappingURL=autobuild.js.map