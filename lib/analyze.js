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
const analysisPaths = __importStar(require("./analysis-paths"));
const codeql_1 = require("./codeql");
const count_loc_1 = require("./count-loc");
const languages_1 = require("./languages");
const sharedEnv = __importStar(require("./shared-environment"));
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
            await codeql.extractScannedLanguage(util.getCodeQLDatabasePath(config, language), language);
            logger.endGroup();
        }
    }
}
async function finalizeDatabaseCreation(config, threadsFlag, logger) {
    await createdDBForScannedLanguages(config, logger);
    const codeql = codeql_1.getCodeQL(config.codeQLCmd);
    for (const language of config.languages) {
        logger.startGroup(`Finalizing ${language}`);
        await codeql.finalizeDatabase(util.getCodeQLDatabasePath(config, language), threadsFlag);
        logger.endGroup();
    }
}
// Runs queries and creates sarif files in the given folder
async function runQueries(sarifFolder, memoryFlag, addSnippetsFlag, threadsFlag, automationDetailsId, config, logger) {
    var _a, _b;
    const statusReport = {};
    // count the number of lines in the background
    const locPromise = count_loc_1.countLoc(path.resolve(), 
    // config.paths specifies external directories. the current
    // directory is included in the analysis by default. Replicate
    // that here.
    config.paths, config.pathsIgnore, config.languages, logger);
    for (const language of config.languages) {
        const queries = config.queries[language];
        const packsWithVersion = config.packs[language] || [];
        const hasBuiltinQueries = ((_a = queries) === null || _a === void 0 ? void 0 : _a.builtin.length) > 0;
        const hasCustomQueries = ((_b = queries) === null || _b === void 0 ? void 0 : _b.custom.length) > 0;
        const hasPackWithCustomQueries = packsWithVersion.length > 0;
        if (!hasBuiltinQueries && !hasCustomQueries && !hasPackWithCustomQueries) {
            throw new Error(`Unable to analyse ${language} as no queries were selected for this language`);
        }
        try {
            if (hasPackWithCustomQueries) {
                logger.startGroup(`Downloading custom packs for ${language}`);
                const codeql = codeql_1.getCodeQL(config.codeQLCmd);
                const results = await codeql.packDownload(packsWithVersion);
                logger.info(`Downloaded packs: ${results.packs
                    .map((r) => `${r.name}@${r.version || "latest"}`)
                    .join(", ")}`);
                logger.endGroup();
            }
            logger.startGroup(`Running queries for ${language}`);
            const querySuitePaths = [];
            if (queries["builtin"].length > 0) {
                const startTimeBuiltIn = new Date().getTime();
                querySuitePaths.push(await runQueryGroup(language, "builtin", createQuerySuiteContents(queries["builtin"]), undefined));
                statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
                    new Date().getTime() - startTimeBuiltIn;
            }
            const startTimeCustom = new Date().getTime();
            let ranCustom = false;
            for (let i = 0; i < queries["custom"].length; ++i) {
                if (queries["custom"][i].queries.length > 0) {
                    querySuitePaths.push(await runQueryGroup(language, `custom-${i}`, createQuerySuiteContents(queries["custom"][i].queries), queries["custom"][i].searchPath));
                    ranCustom = true;
                }
            }
            if (packsWithVersion.length > 0) {
                querySuitePaths.push(await runQueryGroup(language, "packs", createPackSuiteContents(packsWithVersion), undefined));
                ranCustom = true;
            }
            if (ranCustom) {
                statusReport[`analyze_custom_queries_${language}_duration_ms`] =
                    new Date().getTime() - startTimeCustom;
            }
            logger.endGroup();
            logger.startGroup(`Interpreting results for ${language}`);
            const startTimeInterpretResults = new Date().getTime();
            const sarifFile = path.join(sarifFolder, `${language}.sarif`);
            const analysisSummary = await runInterpretResults(language, querySuitePaths, sarifFile);
            await injectLinesOfCode(sarifFile, language, locPromise);
            statusReport[`interpret_results_${language}_duration_ms`] =
                new Date().getTime() - startTimeInterpretResults;
            logger.endGroup();
            logger.info(analysisSummary);
            printLinesOfCodeSummary(logger, language, await locPromise);
        }
        catch (e) {
            logger.info(e);
            logger.info(e.stack);
            statusReport.analyze_failure_language = language;
            throw new CodeQLAnalysisError(statusReport, `Error running analysis for ${language}: ${e}`);
        }
    }
    return statusReport;
    async function runInterpretResults(language, queries, sarifFile) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        const codeql = codeql_1.getCodeQL(config.codeQLCmd);
        return await codeql.databaseInterpretResults(databasePath, queries, sarifFile, addSnippetsFlag, threadsFlag, automationDetailsId);
    }
    async function runQueryGroup(language, type, querySuiteContents, searchPath) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        // Pass the queries to codeql using a file instead of using the command
        // line to avoid command line length restrictions, particularly on windows.
        const querySuitePath = `${databasePath}-queries-${type}.qls`;
        fs.writeFileSync(querySuitePath, querySuiteContents);
        logger.debug(`Query suite file for ${language}-${type}...\n${querySuiteContents}`);
        const codeql = codeql_1.getCodeQL(config.codeQLCmd);
        await codeql.databaseRunQueries(databasePath, searchPath, querySuitePath, memoryFlag, threadsFlag);
        logger.debug(`BQRS results produced for ${language} (queries: ${type})"`);
        return querySuitePath;
    }
}
exports.runQueries = runQueries;
function createQuerySuiteContents(queries) {
    return queries.map((q) => `- query: ${q}`).join("\n");
}
function createPackSuiteContents(packsWithVersion) {
    return packsWithVersion.map(packWithVersionToQuerySuiteEntry).join("\n");
}
function packWithVersionToQuerySuiteEntry(pack) {
    let text = `- qlpack: ${pack.packName}`;
    if (pack.version) {
        text += `${"\n"}  version: ${pack.version}`;
    }
    return text;
}
async function runAnalyze(outputDir, memoryFlag, addSnippetsFlag, threadsFlag, automationDetailsId, config, logger) {
    // Delete the tracer config env var to avoid tracing ourselves
    delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];
    fs.mkdirSync(outputDir, { recursive: true });
    await finalizeDatabaseCreation(config, threadsFlag, logger);
    const queriesStats = await runQueries(outputDir, memoryFlag, addSnippetsFlag, threadsFlag, automationDetailsId, config, logger);
    return { ...queriesStats };
}
exports.runAnalyze = runAnalyze;
async function runCleanup(config, cleanupLevel, logger) {
    logger.startGroup("Cleaning up databases");
    for (const language of config.languages) {
        const codeql = codeql_1.getCodeQL(config.codeQLCmd);
        const databasePath = util.getCodeQLDatabasePath(config, language);
        await codeql.databaseCleanup(databasePath, cleanupLevel);
    }
    logger.endGroup();
}
exports.runCleanup = runCleanup;
async function injectLinesOfCode(sarifFile, language, locPromise) {
    const lineCounts = await locPromise;
    const idPrefix = count_loc_1.getIdPrefix(language);
    if (language in lineCounts) {
        const sarif = JSON.parse(fs.readFileSync(sarifFile, "utf8"));
        if (Array.isArray(sarif.runs)) {
            for (const run of sarif.runs) {
                const ruleId = `${idPrefix}/summary/lines-of-code`;
                run.properties = run.properties || {};
                run.properties.metricResults = run.properties.metricResults || [];
                const rule = run.properties.metricResults.find(
                // the rule id can be in either of two places
                (r) => { var _a; return r.ruleId === ruleId || ((_a = r.rule) === null || _a === void 0 ? void 0 : _a.id) === ruleId; });
                // only add the baseline value if the rule already exists
                if (rule) {
                    rule.baseline = lineCounts[language];
                }
            }
        }
        fs.writeFileSync(sarifFile, JSON.stringify(sarif));
    }
}
function printLinesOfCodeSummary(logger, language, lineCounts) {
    if (language in lineCounts) {
        logger.info(`Counted a baseline of ${lineCounts[language]} lines of code for ${language}.`);
    }
}
//# sourceMappingURL=analyze.js.map