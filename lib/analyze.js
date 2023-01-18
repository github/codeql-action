"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateQueryFilters = exports.runCleanup = exports.runFinalize = exports.createQuerySuiteContents = exports.convertPackToQuerySuiteEntry = exports.runQueries = exports.dbIsFinalized = exports.createdDBForScannedLanguages = exports.CodeQLAnalysisError = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const perf_hooks_1 = require("perf_hooks"); // We need to import `performance` on Node 12
const toolrunner = __importStar(require("@actions/exec/lib/toolrunner"));
const del_1 = __importDefault(require("del"));
const yaml = __importStar(require("js-yaml"));
const analysisPaths = __importStar(require("./analysis-paths"));
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const languages_1 = require("./languages");
const sharedEnv = __importStar(require("./shared-environment"));
const tracer_config_1 = require("./tracer-config");
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
    const scriptsFolder = path.resolve(__dirname, "../python-setup");
    let output = "";
    const options = {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            },
        },
    };
    await new toolrunner.ToolRunner(codeqlPython, [path.join(scriptsFolder, "find_site_packages.py")], options).exec();
    logger.info(`Setting LGTM_INDEX_IMPORT_PATH=${output}`);
    process.env["LGTM_INDEX_IMPORT_PATH"] = output;
    output = "";
    await new toolrunner.ToolRunner(codeqlPython, ["-c", "import sys; print(sys.version_info[0])"], options).exec();
    logger.info(`Setting LGTM_PYTHON_SETUP_VERSION=${output}`);
    process.env["LGTM_PYTHON_SETUP_VERSION"] = output;
}
async function createdDBForScannedLanguages(codeql, config, logger) {
    // Insert the LGTM_INDEX_X env vars at this point so they are set when
    // we extract any scanned languages.
    analysisPaths.includeAndExcludeAnalysisPaths(config);
    for (const language of config.languages) {
        if ((0, languages_1.isScannedLanguage)(language) &&
            !dbIsFinalized(config, language, logger)) {
            logger.startGroup(`Extracting ${language}`);
            if (language === languages_1.Language.python) {
                await setupPythonExtractor(logger);
            }
            await codeql.extractScannedLanguage(config, language);
            logger.endGroup();
        }
    }
}
exports.createdDBForScannedLanguages = createdDBForScannedLanguages;
function dbIsFinalized(config, language, logger) {
    const dbPath = util.getCodeQLDatabasePath(config, language);
    try {
        const dbInfo = yaml.load(fs.readFileSync(path.resolve(dbPath, "codeql-database.yml"), "utf8"));
        return !("inProgress" in dbInfo);
    }
    catch (e) {
        logger.warning(`Could not check whether database for ${language} was finalized. Assuming it is not.`);
        return false;
    }
}
exports.dbIsFinalized = dbIsFinalized;
async function finalizeDatabaseCreation(config, threadsFlag, memoryFlag, logger) {
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    const extractionStart = perf_hooks_1.performance.now();
    await createdDBForScannedLanguages(codeql, config, logger);
    const extractionTime = perf_hooks_1.performance.now() - extractionStart;
    const trapImportStart = perf_hooks_1.performance.now();
    for (const language of config.languages) {
        if (dbIsFinalized(config, language, logger)) {
            logger.info(`There is already a finalized database for ${language} at the location where the CodeQL Action places databases, so we did not create one.`);
        }
        else {
            logger.startGroup(`Finalizing ${language}`);
            await codeql.finalizeDatabase(util.getCodeQLDatabasePath(config, language), threadsFlag, memoryFlag);
            logger.endGroup();
        }
    }
    const trapImportTime = perf_hooks_1.performance.now() - trapImportStart;
    return {
        scanned_language_extraction_duration_ms: Math.round(extractionTime),
        trap_import_duration_ms: Math.round(trapImportTime),
    };
}
// Runs queries and creates sarif files in the given folder
async function runQueries(sarifFolder, memoryFlag, addSnippetsFlag, threadsFlag, automationDetailsId, config, logger, featureEnablement) {
    const statusReport = {};
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    await util.logCodeScanningConfigInCli(codeql, featureEnablement, logger);
    for (const language of config.languages) {
        const queries = config.queries[language];
        const queryFilters = validateQueryFilters(config.originalUserInput["query-filters"]);
        const packsWithVersion = config.packs[language] || [];
        try {
            if (await util.useCodeScanningConfigInCli(codeql, featureEnablement)) {
                // If we are using the code scanning config in the CLI,
                // much of the work needed to generate the query suites
                // is done in the CLI. We just need to make a single
                // call to run all the queries for each language and
                // another to interpret the results.
                logger.startGroup(`Running queries for ${language}`);
                const startTimeBuiltIn = new Date().getTime();
                await runQueryGroup(language, "all", undefined, undefined);
                // TODO should not be using `builtin` here. We should be using `all` instead.
                // The status report does not support `all` yet.
                statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
                    new Date().getTime() - startTimeBuiltIn;
                logger.startGroup(`Interpreting results for ${language}`);
                const startTimeInterpretResults = new Date().getTime();
                const sarifFile = path.join(sarifFolder, `${language}.sarif`);
                const analysisSummary = await runInterpretResults(language, undefined, sarifFile, config.debugMode);
                statusReport[`interpret_results_${language}_duration_ms`] =
                    new Date().getTime() - startTimeInterpretResults;
                logger.endGroup();
                logger.info(analysisSummary);
            }
            else {
                // config was generated by the action, so must be interpreted by the action.
                const hasBuiltinQueries = (queries === null || queries === void 0 ? void 0 : queries.builtin.length) > 0;
                const hasCustomQueries = (queries === null || queries === void 0 ? void 0 : queries.custom.length) > 0;
                const hasPackWithCustomQueries = packsWithVersion.length > 0;
                if (!hasBuiltinQueries &&
                    !hasCustomQueries &&
                    !hasPackWithCustomQueries) {
                    throw new Error(`Unable to analyze ${language} as no queries were selected for this language`);
                }
                logger.startGroup(`Running queries for ${language}`);
                const querySuitePaths = [];
                if (queries["builtin"].length > 0) {
                    const startTimeBuiltIn = new Date().getTime();
                    querySuitePaths.push((await runQueryGroup(language, "builtin", createQuerySuiteContents(queries["builtin"], queryFilters), undefined)));
                    statusReport[`analyze_builtin_queries_${language}_duration_ms`] =
                        new Date().getTime() - startTimeBuiltIn;
                }
                const startTimeCustom = new Date().getTime();
                let ranCustom = false;
                for (let i = 0; i < queries["custom"].length; ++i) {
                    if (queries["custom"][i].queries.length > 0) {
                        querySuitePaths.push((await runQueryGroup(language, `custom-${i}`, createQuerySuiteContents(queries["custom"][i].queries, queryFilters), queries["custom"][i].searchPath)));
                        ranCustom = true;
                    }
                }
                if (packsWithVersion.length > 0) {
                    querySuitePaths.push(await runQueryPacks(language, "packs", packsWithVersion, queryFilters));
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
                const analysisSummary = await runInterpretResults(language, querySuitePaths, sarifFile, config.debugMode);
                statusReport[`interpret_results_${language}_duration_ms`] =
                    new Date().getTime() - startTimeInterpretResults;
                logger.endGroup();
                logger.info(analysisSummary);
            }
            logger.info(await runPrintLinesOfCode(language));
        }
        catch (e) {
            logger.info(String(e));
            if (e instanceof Error) {
                logger.info(e.stack);
            }
            statusReport.analyze_failure_language = language;
            throw new CodeQLAnalysisError(statusReport, `Error running analysis for ${language}: ${e}`);
        }
    }
    return statusReport;
    async function runInterpretResults(language, queries, sarifFile, enableDebugLogging) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        return await codeql.databaseInterpretResults(databasePath, queries, sarifFile, addSnippetsFlag, threadsFlag, enableDebugLogging ? "-vv" : "-v", automationDetailsId);
    }
    async function runPrintLinesOfCode(language) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        return await codeql.databasePrintBaseline(databasePath);
    }
    async function runQueryGroup(language, type, querySuiteContents, searchPath) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        // Pass the queries to codeql using a file instead of using the command
        // line to avoid command line length restrictions, particularly on windows.
        const querySuitePath = querySuiteContents
            ? `${databasePath}-queries-${type}.qls`
            : undefined;
        if (querySuiteContents && querySuitePath) {
            fs.writeFileSync(querySuitePath, querySuiteContents);
            logger.debug(`Query suite file for ${language}-${type}...\n${querySuiteContents}`);
        }
        await codeql.databaseRunQueries(databasePath, searchPath, querySuitePath, memoryFlag, threadsFlag);
        logger.debug(`BQRS results produced for ${language} (queries: ${type})"`);
        return querySuitePath;
    }
    async function runQueryPacks(language, type, packs, queryFilters) {
        const databasePath = util.getCodeQLDatabasePath(config, language);
        for (const pack of packs) {
            logger.debug(`Running query pack for ${language}-${type}: ${pack}`);
        }
        // combine the list of packs into a query suite in order to run them all simultaneously.
        const querySuite = packs.map(convertPackToQuerySuiteEntry).concat(queryFilters);
        const querySuitePath = `${databasePath}-queries-${type}.qls`;
        fs.writeFileSync(querySuitePath, yaml.dump(querySuite));
        logger.debug(`BQRS results produced for ${language} (queries: ${type})"`);
        await codeql.databaseRunQueries(databasePath, undefined, querySuitePath, memoryFlag, threadsFlag);
        return querySuitePath;
    }
}
exports.runQueries = runQueries;
function convertPackToQuerySuiteEntry(packStr) {
    var _a, _b, _c, _d;
    const pack = configUtils.parsePacksSpecification(packStr);
    return {
        qlpack: !pack.path ? pack.name : undefined,
        from: pack.path ? pack.name : undefined,
        version: pack.version,
        query: ((_a = pack.path) === null || _a === void 0 ? void 0 : _a.endsWith(".ql")) ? pack.path : undefined,
        queries: !((_b = pack.path) === null || _b === void 0 ? void 0 : _b.endsWith(".ql")) && !((_c = pack.path) === null || _c === void 0 ? void 0 : _c.endsWith(".qls"))
            ? pack.path
            : undefined,
        apply: ((_d = pack.path) === null || _d === void 0 ? void 0 : _d.endsWith(".qls")) ? pack.path : undefined,
    };
}
exports.convertPackToQuerySuiteEntry = convertPackToQuerySuiteEntry;
function createQuerySuiteContents(queries, queryFilters) {
    return yaml.dump(queries.map((q) => ({ query: q })).concat(queryFilters));
}
exports.createQuerySuiteContents = createQuerySuiteContents;
async function runFinalize(outputDir, threadsFlag, memoryFlag, config, logger) {
    try {
        await (0, del_1.default)(outputDir, { force: true });
    }
    catch (error) {
        if ((error === null || error === void 0 ? void 0 : error.code) !== "ENOENT") {
            throw error;
        }
    }
    await fs.promises.mkdir(outputDir, { recursive: true });
    const timings = await finalizeDatabaseCreation(config, threadsFlag, memoryFlag, logger);
    const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
    // WARNING: This does not _really_ end tracing, as the tracer will restore its
    // critical environment variables and it'll still be active for all processes
    // launched from this build step.
    // However, it will stop tracing for all steps past the codeql-action/analyze
    // step.
    if (await util.codeQlVersionAbove(codeql, codeql_1.CODEQL_VERSION_NEW_TRACING)) {
        // Delete variables as specified by the end-tracing script
        await (0, tracer_config_1.endTracingForCluster)(config);
    }
    else {
        // Delete the tracer config env var to avoid tracing ourselves
        delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];
    }
    return timings;
}
exports.runFinalize = runFinalize;
async function runCleanup(config, cleanupLevel, logger) {
    logger.startGroup("Cleaning up databases");
    for (const language of config.languages) {
        const codeql = await (0, codeql_1.getCodeQL)(config.codeQLCmd);
        const databasePath = util.getCodeQLDatabasePath(config, language);
        await codeql.databaseCleanup(databasePath, cleanupLevel);
    }
    logger.endGroup();
}
exports.runCleanup = runCleanup;
// exported for testing
function validateQueryFilters(queryFilters) {
    if (!queryFilters) {
        return [];
    }
    if (!Array.isArray(queryFilters)) {
        throw new Error(`Query filters must be an array of "include" or "exclude" entries. Found ${typeof queryFilters}`);
    }
    const errors = [];
    for (const qf of queryFilters) {
        const keys = Object.keys(qf);
        if (keys.length !== 1) {
            errors.push(`Query filter must have exactly one key: ${JSON.stringify(qf)}`);
        }
        if (!["exclude", "include"].includes(keys[0])) {
            errors.push(`Only "include" or "exclude" filters are allowed:\n${JSON.stringify(qf)}`);
        }
    }
    if (errors.length) {
        throw new Error(`Invalid query filter.\n${errors.join("\n")}`);
    }
    return queryFilters;
}
exports.validateQueryFilters = validateQueryFilters;
//# sourceMappingURL=analyze.js.map