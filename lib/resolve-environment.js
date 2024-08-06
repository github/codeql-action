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
exports.runResolveBuildEnvironment = runResolveBuildEnvironment;
const codeql_1 = require("./codeql");
const languages_1 = require("./languages");
const util = __importStar(require("./util"));
async function runResolveBuildEnvironment(cmd, logger, workingDir, languageInput) {
    logger.startGroup(`Attempting to resolve build environment for ${languageInput}`);
    const codeql = await (0, codeql_1.getCodeQL)(cmd);
    let language = languageInput;
    // If the CodeQL CLI version in use supports language aliasing, give the CLI the raw language
    // input. Otherwise, parse the language input and give the CLI the parsed language.
    if (!(await util.codeQlVersionAtLeast(codeql, codeql_1.CODEQL_VERSION_LANGUAGE_ALIASING))) {
        const parsedLanguage = (0, languages_1.parseLanguage)(languageInput)?.toString();
        if (parsedLanguage === undefined) {
            throw new util.ConfigurationError(`Did not recognize the language '${languageInput}'.`);
        }
        language = parsedLanguage;
    }
    if (workingDir !== undefined) {
        logger.info(`Using ${workingDir} as the working directory.`);
    }
    const result = await codeql.resolveBuildEnvironment(workingDir, language);
    logger.endGroup();
    return result;
}
//# sourceMappingURL=resolve-environment.js.map