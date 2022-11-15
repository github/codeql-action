"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAutobuild = exports.determineAutobuildLanguages = void 0;
const codeql_1 = require("./codeql");
const languages_1 = require("./languages");
async function determineAutobuildLanguages(config, logger) {
    // Attempt to find a language to autobuild
    // We want pick the dominant language in the repo from the ones we're able to build
    // The languages are sorted in order specified by user or by lines of code if we got
    // them from the GitHub API, so try to build the first language on the list.
    const autobuildLanguages = config.languages.filter((l) => (0, languages_1.isTracedLanguage)(l));
    if (!autobuildLanguages) {
        logger.info("None of the languages in this project require extra build steps");
        return undefined;
    }
    /**
     * Additionally autobuild Go in the autobuild Action to ensure backwards
     * compatibility for users performing a multi-language build within a single
     * job.
     *
     * For example, consider a user with the following workflow file:
     *
     * ```yml
     * - uses: github/codeql-action/init@v2
     *   with:
     *     languages: go, java
     * - uses: github/codeql-action/autobuild@v2
     * - uses: github/codeql-action/analyze@v2
     * ```
     *
     * - With Go extraction disabled, we will run the Java autobuilder in the
     *   autobuild Action, ensuring we extract both Java and Go code.
     * - With Go extraction enabled, taking the previous behavior we'd run the Go
     *   autobuilder, since Go is first on the list of languages. We wouldn't run
     *   the Java autobuilder at all and so we'd only extract Go code.
     *
     * We therefore introduce a special case here such that we'll autobuild Go
     * in addition to the primary non-Go traced language in the autobuild Action.
     *
     * This special case behavior should be removed as part of the next major
     * version of the CodeQL Action.
     */
    const autobuildLanguagesWithoutGo = autobuildLanguages.filter((l) => l !== languages_1.Language.go);
    const languages = [];
    // First run the autobuilder for the first non-Go traced language, if one
    // exists.
    if (autobuildLanguagesWithoutGo[0] !== undefined) {
        languages.push(autobuildLanguagesWithoutGo[0]);
    }
    // If Go is requested, run the Go autobuilder last to ensure it doesn't
    // interfere with the other autobuilder.
    if (autobuildLanguages.length !== autobuildLanguagesWithoutGo.length) {
        languages.push(languages_1.Language.go);
    }
    logger.debug(`Will autobuild ${languages.join(" and ")}.`);
    // In general the autobuilders for other traced languages may conflict with
    // each other. Therefore if a user has requested more than one non-Go traced
    // language, we ask for manual build steps.
    // Matrixing the build would also work, but that would change the SARIF
    // categories, potentially leading to a "stale tips" situation where alerts
    // that should be fixed remain on a repo since they are linked to SARIF
    // categories that are no longer updated.
    if (autobuildLanguagesWithoutGo.length > 1) {
        logger.warning(`We will only automatically build ${languages.join(" and ")} code. If you wish to scan ${autobuildLanguagesWithoutGo
            .slice(1)
            .join(" and ")}, you must replace the autobuild step of your workflow with custom build steps. ` +
            "For more information, see " +
            "https://docs.github.com/en/code-security/code-scanning/automatically-scanning-your-code-for-vulnerabilities-and-errors/configuring-the-codeql-workflow-for-compiled-languages#adding-build-steps-for-a-compiled-language");
    }
    return languages;
}
exports.determineAutobuildLanguages = determineAutobuildLanguages;
async function runAutobuild(language, config, logger) {
    logger.startGroup(`Attempting to automatically build ${language} code`);
    const codeQL = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    await codeQL.runAutobuild(language);
    logger.endGroup();
}
exports.runAutobuild = runAutobuild;
//# sourceMappingURL=autobuild.js.map