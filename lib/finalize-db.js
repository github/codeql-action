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
const path = __importStar(require("path"));
const codeql_1 = require("./codeql");
const configUtils = __importStar(require("./config-utils"));
const sharedEnv = __importStar(require("./shared-environment"));
const upload_lib = __importStar(require("./upload-lib"));
const util = __importStar(require("./util"));
async function setupPythonExtractor() {
    const codeqlPython = process.env["CODEQL_PYTHON"];
    if (codeqlPython === undefined || codeqlPython.length === 0) {
        // If CODEQL_PYTHON is not set, no dependencies were installed, so we don't need to do anything
        return;
    }
    let output = '';
    const options = {
        listeners: {
            stdout: (data) => {
                output += data.toString();
            }
        }
    };
    await exec.exec(codeqlPython, ['-c', 'import os; import pip; print(os.path.dirname(os.path.dirname(pip.__file__)))'], options);
    core.info('Setting LGTM_INDEX_IMPORT_PATH=' + output);
    process.env['LGTM_INDEX_IMPORT_PATH'] = output;
    output = '';
    await exec.exec(codeqlPython, ['-c', 'import sys; print(sys.version_info[0])'], options);
    core.info('Setting LGTM_PYTHON_SETUP_VERSION=' + output);
    process.env['LGTM_PYTHON_SETUP_VERSION'] = output;
}
async function createdDBForScannedLanguages(databaseFolder) {
    const scannedLanguages = process.env[sharedEnv.CODEQL_ACTION_SCANNED_LANGUAGES];
    if (scannedLanguages) {
        const codeql = codeql_1.getCodeQL();
        for (const language of scannedLanguages.split(',')) {
            core.startGroup('Extracting ' + language);
            if (language === 'python') {
                await setupPythonExtractor();
            }
            await codeql.extractScannedLanguage(path.join(databaseFolder, language), language);
            core.endGroup();
        }
    }
}
async function finalizeDatabaseCreation(databaseFolder, config) {
    await createdDBForScannedLanguages(databaseFolder);
    const codeql = codeql_1.getCodeQL();
    for (const language of config.languages) {
        core.startGroup('Finalizing ' + language);
        await codeql.finalizeDatabase(path.join(databaseFolder, language));
        core.endGroup();
    }
}
// Runs queries and creates sarif files in the given folder
async function runQueries(databaseFolder, sarifFolder, config) {
    const codeql = codeql_1.getCodeQL();
    for (let database of fs.readdirSync(databaseFolder)) {
        core.startGroup('Analyzing ' + database);
        const queries = config.queries[database] || [];
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
        await codeql.databaseAnalyze(path.join(databaseFolder, database), sarifFile, querySuite);
        core.debug('SARIF results for database ' + database + ' created at "' + sarifFile + '"');
        core.endGroup();
    }
}
async function run() {
    try {
        if (util.should_abort('finish', true) || !await util.reportActionStarting('finish')) {
            return;
        }
        const config = await configUtils.getConfig();
        core.exportVariable(sharedEnv.ODASA_TRACER_CONFIGURATION, '');
        delete process.env[sharedEnv.ODASA_TRACER_CONFIGURATION];
        const databaseFolder = util.getRequiredEnvParam(sharedEnv.CODEQL_ACTION_DATABASE_DIR);
        const sarifFolder = core.getInput('output');
        await io.mkdirP(sarifFolder);
        core.info('Finalizing database creation');
        await finalizeDatabaseCreation(databaseFolder, config);
        core.info('Analyzing database');
        await runQueries(databaseFolder, sarifFolder, config);
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