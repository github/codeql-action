"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAutobuild = exports.determineAutobuildLanguage = void 0;
const codeql_1 = require("./codeql");
const languages_1 = require("./languages");
function determineAutobuildLanguage(config, logger) {
    // Attempt to find a language to autobuild
    // We want pick the dominant language in the repo from the ones we're able to build
    // The languages are sorted in order specified by user or by lines of code if we got
    // them from the GitHub API, so try to build the first language on the list.
    const autobuildLanguages = config.languages.filter(languages_1.isTracedLanguage);
    const language = autobuildLanguages[0];
    if (!language) {
        logger.info("None of the languages in this project require extra build steps");
        return undefined;
    }
    logger.debug(`Detected dominant traced language: ${language}`);
    if (autobuildLanguages.length > 1) {
        logger.warning(`We will only automatically build ${language} code. If you wish to scan ${autobuildLanguages
            .slice(1)
            .join(" and ")}, you must replace this call with custom build steps.`);
    }
    return language;
}
exports.determineAutobuildLanguage = determineAutobuildLanguage;
async function runAutobuild(language, config, logger) {
    logger.startGroup(`Attempting to automatically build ${language} code`);
    const codeQL = codeql_1.getCodeQL(config.codeQLCmd);
    await codeQL.runAutobuild(language);
    logger.endGroup();
}
exports.runAutobuild = runAutobuild;
//# sourceMappingURL=autobuild.js.map