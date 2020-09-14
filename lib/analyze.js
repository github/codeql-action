"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const analysisPaths = __importStar(require("./analysis-paths"));
const codeql_1 = require("./codeql");
const languages_1 = require("./languages");
const sharedEnv = __importStar(require("./shared-environment"));
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
async function createdDBForScannedLanguages(config, logger) {
    // Insert the LGTM_INDEX_X env vars at this point so they are set when
    // we extract any scanned languages.
    analysisPaths.includeAndExcludeAnalysisPaths(config);
    const codeql = codeql_1.getCodeQL(config.codeQLCmd);
    for (const language of config.languages) {
        if (languages_1.isScannedLanguage(language)) {
            logger.startGroup(`Extracting ${language}`);
            await codeql.extractScannedLanguage(util.getCodeQLDatabasePath(config.tempDir, language), language);
            logger.endGroup();
        }
    }
}
async function finalizeDatabaseCreation(config, logger) {
    await createdDBForScannedLanguages(config, logger);
    const codeql = codeql_1.getCodeQL(config.codeQLCmd);
    for (const language of config.languages) {
        logger.startGroup(`Finalizing ${language}`);
        await codeql.finalizeDatabase(util.getCodeQLDatabasePath(config.tempDir, language));
        logger.endGroup();
    }
}
// Runs queries and creates sarif files in the given folder
async function runQueries(sarifFolder, memoryFlag, addSnippetsFlag, threadsFlag, config, logger) {
    const codeql = codeql_1.getCodeQL(config.codeQLCmd);
    for (const language of config.languages) {
        logger.startGroup(`Analyzing ${language}`);
        const queries = config.queries[language] || [];
        if (queries.length === 0) {
            throw new Error(`Unable to analyse ${language} as no queries were selected for this language`);
        }
        try {
            const databasePath = util.getCodeQLDatabasePath(config.tempDir, language);
            // Pass the queries to codeql using a file instead of using the command
            // line to avoid command line length restrictions, particularly on windows.
            const querySuite = `${databasePath}-queries.qls`;
            const querySuiteContents = queries.map((q) => `- query: ${q}`).join("\n");
            fs.writeFileSync(querySuite, querySuiteContents);
            logger.debug(`Query suite file for ${language}...\n${querySuiteContents}`);
            const sarifFile = path.join(sarifFolder, `${language}.sarif`);
            await codeql.databaseAnalyze(databasePath, sarifFile, querySuite, memoryFlag, addSnippetsFlag, threadsFlag);
            logger.debug(`SARIF results for database ${language} created at "${sarifFile}"`);
            logger.endGroup();
        }
        catch (e) {
            // For now the fields about query performance are not populated
            return {
                analyze_failure_language: language,
            };
        }
    }
    return {};
}
async function runAnalyze(repositoryNwo, commitOid, ref, analysisKey, analysisName, workflowRunID, checkoutPath, environment, githubAuth, githubUrl, doUpload, mode, outputDir, memoryFlag, addSnippetsFlag, threadsFlag, config, logger) {
    // Delete the tracer config env var to avoid tracing ourselves
    delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info("Finalizing database creation");
    await finalizeDatabaseCreation(config, logger);
    logger.info("Analyzing database");
    const queriesStats = await runQueries(outputDir, memoryFlag, addSnippetsFlag, threadsFlag, config, logger);
    if (!doUpload) {
        logger.info("Not uploading results");
        return { ...queriesStats };
    }
    const uploadStats = await upload_lib.upload(outputDir, repositoryNwo, commitOid, ref, analysisKey, analysisName, workflowRunID, checkoutPath, environment, githubAuth, githubUrl, mode, logger);
    return { ...queriesStats, ...uploadStats };
}
exports.runAnalyze = runAnalyze;
//# sourceMappingURL=analyze.js.map