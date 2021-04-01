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
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const actionsUtil = __importStar(require("./actions-util"));
const analysisPaths = __importStar(require("./analysis-paths"));
const codeql_1 = require("./codeql");
const languages_1 = require("./languages");
const sharedEnv = __importStar(require("./shared-environment"));
const upload_lib_1 = require("./upload-lib");
const util = __importStar(require("./util"));
class CodeQLAnalysisError extends Error {
    constructor(queriesStatusReport, message) {
        super(message);
        this.name = "CodeQLAnalysisError";
        this.queriesStatusReport = queriesStatusReport;
    }
}
exports.CodeQLAnalysisError = CodeQLAnalysisError;
async function setupPythonExtractor(logger) {
    const codeqlPython = process.env["CODEQL_PYTHON"];
    if (codeqlPython === undefined || codeqlPython.length === 0) {
        // If CODEQL_PYTHON is not set, no dependencies were installed, so we don't need to do anything
        return;
    }
    let output = "";
    const options = {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            },
        },
    };
    await new toolrunner.ToolRunner(codeqlPython, [
        "-c",
        "import os; import pip; print(os.path.dirname(os.path.dirname(pip.__file__)))",
    ], options).exec();
    logger.info(`Setting LGTM_INDEX_IMPORT_PATH=${output}`);
    process.env["LGTM_INDEX_IMPORT_PATH"] = output;
    output = "";
    await new toolrunner.ToolRunner(codeqlPython, ["-c", "import sys; print(sys.version_info[0])"], options).exec();
    logger.info(`Setting LGTM_PYTHON_SETUP_VERSION=${output}`);
    process.env["LGTM_PYTHON_SETUP_VERSION"] = output;
}
async function createdDBForScannedLanguages(config, logger) {
    // Insert the LGTM_INDEX_X env vars at this point so they are set when
    // we extract any scanned languages.
    analysisPaths.includeAndExcludeAnalysisPaths(config);
    const codeql = codeql_1.getCodeQL(config.codeQLCmd);
    for (const language of config.languages) {
        if (languages_1.isScannedLanguage(language)) {
            logger.startGroup(`Extracting ${language}`);
            if (language === languages_1.Language.python) {
                await setupPythonExtractor(logger);
            }
            await codeql.extractScannedLanguage(util.getCodeQLDatabasePath(config.tempDir, language), language);
            logger.endGroup();
        }
    }
}
async function finalizeDatabaseCreation(config, threadsFlag, logger) {
    await createdDBForScannedLanguages(config, logger);
    const codeql = codeql_1.getCodeQL(config.codeQLCmd);
    for (const language of config.languages) {
        logger.startGroup(`Finalizing ${language}`);
        await codeql.finalizeDatabase(util.getCodeQLDatabasePath(config.tempDir, language), threadsFlag);
        logger.endGroup();
    }
}
// Runs queries and creates sarif files in the given folder
async function runQueries(sarifFolder, memoryFlag, addSnippetsFlag, threadsFlag, config, logger) {
    const statusReport = {};
    for (const language of config.languages) {
        logger.startGroup(`Analyzing ${language}`);
        const queries = config.queries[language];
        if (queries.builtin.length === 0 && queries.custom.length === 0) {
            throw new Error(`Unable to analyse ${language} as no queries were selected for this language`);
        }
        try {
            if (queries["builtin"].length > 0) {
                const startTimeBuliltIn = new Date().getTime();
                await runQueryGroup(language, "builtin", queries["builtin"], sarifFolder, undefined);
                statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
                    new Date().getTime() - startTimeBuliltIn;
            }
            const startTimeCustom = new Date().getTime();
            const temporarySarifDir = actionsUtil.getTemporaryDirectory();
            const temporarySarifFiles = [];
            for (let i = 0; i < queries["custom"].length; ++i) {
                if (queries["custom"][i].queries.length > 0) {
                    await runQueryGroup(language, `custom-${i}`, queries["custom"][i].queries, temporarySarifDir, queries["custom"][i].searchPath);
                    temporarySarifFiles.push(path.join(temporarySarifDir, `${language}-custom-${i}.sarif`));
                }
            }
            if (temporarySarifFiles.length > 0) {
                fs.writeFileSync(path.join(sarifFolder, `${language}-custom.sarif`), upload_lib_1.combineSarifFiles(temporarySarifFiles));
                statusReport[`analyze_custom_queries_${language}_duration_ms`] =
                    new Date().getTime() - startTimeCustom;
            }
        }
        catch (e) {
            logger.info(e);
            statusReport.analyze_failure_language = language;
            throw new CodeQLAnalysisError(statusReport, `Error running analysis for ${language}: ${e}`);
        }
    }
    return statusReport;
    async function runQueryGroup(language, type, queries, destinationFolder, searchPath) {
        const databasePath = util.getCodeQLDatabasePath(config.tempDir, language);
        // Pass the queries to codeql using a file instead of using the command
        // line to avoid command line length restrictions, particularly on windows.
        const querySuitePath = `${databasePath}-queries-${type}.qls`;
        const querySuiteContents = queries
            .map((q) => `- query: ${q}`)
            .join("\n");
        fs.writeFileSync(querySuitePath, querySuiteContents);
        logger.debug(`Query suite file for ${language}...\n${querySuiteContents}`);
        const sarifFile = path.join(destinationFolder, `${language}-${type}.sarif`);
        const codeql = codeql_1.getCodeQL(config.codeQLCmd);
        await codeql.databaseAnalyze(databasePath, sarifFile, searchPath, querySuitePath, memoryFlag, addSnippetsFlag, threadsFlag);
        logger.debug(`SARIF results for database ${language} created at "${sarifFile}"`);
        logger.endGroup();
    }
}
exports.runQueries = runQueries;
async function runAnalyze(outputDir, memoryFlag, addSnippetsFlag, threadsFlag, config, logger) {
    // Delete the tracer config env var to avoid tracing ourselves
    delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info("Finalizing database creation");
    await finalizeDatabaseCreation(config, threadsFlag, logger);
    logger.info("Analyzing database");
    const queriesStats = await runQueries(outputDir, memoryFlag, addSnippetsFlag, threadsFlag, config, logger);
    return { ...queriesStats };
}
exports.runAnalyze = runAnalyze;
//# sourceMappingURL=analyze.js.map