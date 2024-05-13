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
exports.runAutobuild = exports.setupCppAutobuild = exports.determineAutobuildLanguages = void 0;
const core = __importStar(require("@actions/core"));
const actions_util_1 = require("./actions-util");
const api_client_1 = require("./api-client");
const codeql_1 = require("./codeql");
const environment_1 = require("./environment");
const feature_flags_1 = require("./feature-flags");
const languages_1 = require("./languages");
const repository_1 = require("./repository");
const tools_features_1 = require("./tools-features");
const util_1 = require("./util");
async function determineAutobuildLanguages(codeql, config, logger) {
    if ((config.buildMode === util_1.BuildMode.None &&
        (await codeql.supportsFeature(tools_features_1.ToolsFeature.TraceCommandUseBuildMode))) ||
        config.buildMode === util_1.BuildMode.Manual) {
        logger.info(`Using ${config.buildMode} build mode, nothing to autobuild.`);
        return undefined;
    }
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
     * - uses: github/codeql-action/init@v3
     *   with:
     *     languages: go, java
     * - uses: github/codeql-action/autobuild@v3
     * - uses: github/codeql-action/analyze@v3
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
async function setupCppAutobuild(codeql, logger) {
    const envVar = feature_flags_1.featureConfig[feature_flags_1.Feature.CppDependencyInstallation].envVar;
    const featureName = "C++ automatic installation of dependencies";
    const envDoc = "https://docs.github.com/en/actions/learn-github-actions/variables#defining-environment-variables-for-a-single-workflow";
    const gitHubVersion = await (0, api_client_1.getGitHubVersion)();
    const repositoryNwo = (0, repository_1.parseRepositoryNwo)((0, util_1.getRequiredEnvParam)("GITHUB_REPOSITORY"));
    const features = new feature_flags_1.Features(gitHubVersion, repositoryNwo, (0, actions_util_1.getTemporaryDirectory)(), logger);
    if (await features.getValue(feature_flags_1.Feature.CppDependencyInstallation, codeql)) {
        // disable autoinstall on self-hosted runners unless explicitly requested
        if (process.env["RUNNER_ENVIRONMENT"] === "self-hosted" &&
            process.env[envVar] !== "true") {
            logger.info(`Disabling ${featureName} as we are on a self-hosted runner.${(0, actions_util_1.getWorkflowEventName)() !== "dynamic"
                ? ` To override this, set the ${envVar} environment variable to 'true' in your workflow (see ${envDoc}).`
                : ""}`);
            core.exportVariable(envVar, "false");
        }
        else {
            logger.info(`Enabling ${featureName}. This can be disabled by setting the ${envVar} environment variable to 'false' (see ${envDoc}).`);
            core.exportVariable(envVar, "true");
        }
    }
    else {
        logger.info(`Disabling ${featureName}.`);
        core.exportVariable(envVar, "false");
    }
}
exports.setupCppAutobuild = setupCppAutobuild;
async function runAutobuild(config, language, features, logger) {
    logger.startGroup(`Attempting to automatically build ${language} code`);
    const codeQL = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    if (language === languages_1.Language.cpp) {
        await setupCppAutobuild(codeQL, logger);
    }
    if (config.buildMode &&
        (await features.getValue(feature_flags_1.Feature.AutobuildDirectTracing, codeQL))) {
        await codeQL.extractUsingBuildMode(config, language);
    }
    else {
        await codeQL.runAutobuild(config, language);
    }
    if (language === languages_1.Language.go) {
        core.exportVariable(environment_1.EnvVar.DID_AUTOBUILD_GOLANG, "true");
    }
    logger.endGroup();
}
exports.runAutobuild = runAutobuild;
//# sourceMappingURL=autobuild.js.map