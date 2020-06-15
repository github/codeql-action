"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const io = __importStar(require("@actions/io"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const configUtils = __importStar(require("./config-utils"));
const externalQueries = __importStar(require("./external-queries"));
const sharedEnv = __importStar(require("./shared-environment"));
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
/**
 * A list of queries from https://github.com/github/codeql that
 * we don't want to run. Disabling them here is a quicker alternative to
 * disabling them in the code scanning query suites. Queries should also
 * be disabled in the suites, and removed from this list here once the
 * bundle is updated to make those suite changes live.
 *
 * Format is a map from language to an array of path suffixes of .ql files.
 */
const DISABLED_BUILTIN_QUERIES = {
    'csharp': [
        'ql/src/Security Features/CWE-937/VulnerablePackage.ql',
        'ql/src/Security Features/CWE-451/MissingXFrameOptions.ql',
    ]
};
function queryIsDisabled(language, query) {
    return (DISABLED_BUILTIN_QUERIES[language] || [])
        .some(disabledQuery => query.endsWith(disabledQuery));
}
function getMemoryFlag() {
    let memoryToUseMegaBytes;
    const memoryToUseString = core.getInput("ram");
    if (memoryToUseString) {
        memoryToUseMegaBytes = Number(memoryToUseString);
        if (Number.isNaN(memoryToUseMegaBytes) || memoryToUseMegaBytes <= 0) {
            throw new Error("Invalid RAM setting \"" + memoryToUseString + "\", specified.");
        }
    }
    else {
        const totalMemoryBytes = os.totalmem();
        const totalMemoryMegaBytes = totalMemoryBytes / (1024 * 1024);
        const systemReservedMemoryMegaBytes = 256;
        memoryToUseMegaBytes = totalMemoryMegaBytes - systemReservedMemoryMegaBytes;
    }
    return "--ram=" + Math.floor(memoryToUseMegaBytes);
}
async function createdDBForScannedLanguages(codeqlCmd, databaseFolder) {
    const scannedLanguages = process.env[sharedEnv.CODEQL_ACTION_SCANNED_LANGUAGES];
    if (scannedLanguages) {
        for (const language of scannedLanguages.split(',')) {
            core.startGroup('Extracting ' + language);
            // Get extractor location
            let extractorPath = '';
            await exec.exec(codeqlCmd, ['resolve', 'extractor', '--format=json', '--language=' + language], {
                silent: true,
                listeners: {
                    stdout: (data) => { extractorPath += data.toString(); },
                    stderr: (data) => { process.stderr.write(data); }
                }
            });
            // Set trace command
            const ext = process.platform === 'win32' ? '.cmd' : '.sh';
            const traceCommand = path.resolve(JSON.parse(extractorPath), 'tools', 'autobuild' + ext);
            // Run trace command
            await exec.exec(codeqlCmd, ['database', 'trace-command', path.join(databaseFolder, language), '--', traceCommand]);
            core.endGroup();
        }
    }
}
async function finalizeDatabaseCreation(codeqlCmd, databaseFolder) {
    await createdDBForScannedLanguages(codeqlCmd, databaseFolder);
    const languages = process.env[sharedEnv.CODEQL_ACTION_LANGUAGES] || '';
    for (const language of languages.split(',')) {
        core.startGroup('Finalizing ' + language);
        await exec.exec(codeqlCmd, ['database', 'finalize', path.join(databaseFolder, language)]);
        core.endGroup();
    }
}
async function runResolveQueries(codeqlCmd, queries) {
    let output = '';
    const options = {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            }
        }
    };
    await exec.exec(codeqlCmd, [
        'resolve',
        'queries',
        ...queries,
        '--format=bylanguage'
    ], options);
    return JSON.parse(output);
}
async function resolveQueryLanguages(codeqlCmd, config) {
    let res = new Map();
    if (!config.disableDefaultQueries || config.additionalSuites.length !== 0) {
        const suites = [];
        for (const language of await util.getLanguages()) {
            if (!config.disableDefaultQueries) {
                suites.push(language + '-code-scanning.qls');
            }
            for (const additionalSuite of config.additionalSuites) {
                suites.push(language + '-' + additionalSuite + '.qls');
            }
        }
        const resolveQueriesOutputObject = await runResolveQueries(codeqlCmd, suites);
        for (const [language, queries] of Object.entries(resolveQueriesOutputObject.byLanguage)) {
            if (res[language] === undefined) {
                res[language] = [];
            }
            res[language].push(...Object.keys(queries).filter(q => !queryIsDisabled(language, q)));
        }
    }
    if (config.additionalQueries.length !== 0) {
        const resolveQueriesOutputObject = await runResolveQueries(codeqlCmd, config.additionalQueries);
        for (const [language, queries] of Object.entries(resolveQueriesOutputObject.byLanguage)) {
            if (res[language] === undefined) {
                res[language] = [];
            }
            res[language].push(...Object.keys(queries));
        }
        const noDeclaredLanguage = resolveQueriesOutputObject.noDeclaredLanguage;
        const noDeclaredLanguageQueries = Object.keys(noDeclaredLanguage);
        if (noDeclaredLanguageQueries.length !== 0) {
            throw new Error('Some queries do not declare a language, their qlpack.yml file is missing or is invalid');
        }
        const multipleDeclaredLanguages = resolveQueriesOutputObject.multipleDeclaredLanguages;
        const multipleDeclaredLanguagesQueries = Object.keys(multipleDeclaredLanguages);
        if (multipleDeclaredLanguagesQueries.length !== 0) {
            throw new Error('Some queries declare multiple languages, their qlpack.yml file is missing or is invalid');
        }
    }
    return res;
}
// Runs queries and creates sarif files in the given folder
async function runQueries(codeqlCmd, databaseFolder, sarifFolder, config) {
    const queriesPerLanguage = await resolveQueryLanguages(codeqlCmd, config);
    for (let database of fs.readdirSync(databaseFolder)) {
        core.startGroup('Analyzing ' + database);
        const queries = queriesPerLanguage[database] || [];
        if (queries.length === 0) {
            throw new Error('Unable to analyse ' + database + ' as no queries were selected for this language');
        }
        // Pass the queries to codeql using a file instead of using the command
        // line to avoid command line length restrictions, particularly on windows.
        const querySuite = path.join(databaseFolder, database + '-queries.qls');
        const querySuiteContents = queries.map(q => '- query: ' + q).join('\n');
        fs.writeFileSync(querySuite, querySuiteContents);
        core.debug('Query suite file for ' + database + '...\n' + querySuiteContents);
        const sarifFile = path.join(sarifFolder, database + '.sarif');
        await exec.exec(codeqlCmd, [
            'database',
            'analyze',
            getMemoryFlag(),
            path.join(databaseFolder, database),
            '--format=sarif-latest',
            '--output=' + sarifFile,
            '--no-sarif-add-snippets',
            querySuite
        ]);
        core.debug('SARIF results for database ' + database + ' created at "' + sarifFile + '"');
        core.endGroup();
    }
}
async function run() {
    try {
        if (util.should_abort('finish', true) || !await util.reportActionStarting('finish')) {
            return;
        }
        const config = await configUtils.loadConfig();
        core.exportVariable(sharedEnv.ODASA_TRACER_CONFIGURATION, '');
        delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];
        const codeqlCmd = util.getRequiredEnvParam(sharedEnv.CODEQL_ACTION_CMD);
        const databaseFolder = util.getRequiredEnvParam(sharedEnv.CODEQL_ACTION_DATABASE_DIR);
        const sarifFolder = core.getInput('output');
        await io.mkdirP(sarifFolder);
        core.info('Finalizing database creation');
        await finalizeDatabaseCreation(codeqlCmd, databaseFolder);
        await externalQueries.checkoutExternalQueries(config);
        core.info('Analyzing database');
        await runQueries(codeqlCmd, databaseFolder, sarifFolder, config);
        if ('true' === core.getInput('upload')) {
            if (!await upload_lib.upload(sarifFolder)) {
                await util.reportActionFailed('finish', 'upload');
                return;
            }
        }
    }
    catch (error) {
        core.setFailed(error.message);
        await util.reportActionFailed('finish', error.message, error.stack);
        return;
    }
    await util.reportActionSucceeded('finish');
}
run().catch(e => {
    core.setFailed("analyze action failed: " + e);
    console.log(e);
});
//# sourceMappingURL=finalize-db.js.map