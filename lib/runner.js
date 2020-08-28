"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const analyze_1 = require("./analyze");
const autobuild_1 = require("./autobuild");
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const init_1 = require("./init");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const upload_lib = __importStar(require("./upload-lib"));
const program = new commander_1.Command();
program.version('0.0.1');
function parseGithubUrl(inputUrl) {
    try {
        const url = new URL(inputUrl);
        // If we detect this is trying to be to github.com
        // then return with a fixed canonical URL.
        if (url.hostname === 'github.com' || url.hostname === 'api.github.com') {
            return 'https://github.com';
        }
        // Remove the API prefix if it's present
        if (url.pathname.indexOf('/api/v3') !== -1) {
            url.pathname = url.pathname.substring(0, url.pathname.indexOf('/api/v3'));
        }
        return url.toString();
    }
    catch (e) {
        throw new Error(`"${inputUrl}" is not a valid URL`);
    }
}
function getTempDir(userInput) {
    const tempDir = path.join(userInput || process.cwd(), 'codeql-runner');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}
function getToolsDir(userInput) {
    const toolsDir = userInput || path.join(os.homedir(), 'codeql-runner-tools');
    if (!fs.existsSync(toolsDir)) {
        fs.mkdirSync(toolsDir, { recursive: true });
    }
    return toolsDir;
}
function checkEnvironmentSetup(config) {
    if (config.languages.some(languages_1.isTracedLanguage) && !('ODASA_TRACER_CONFIGURATION' in process.env)) {
        throw new Error("Could not detect 'ODASA_TRACER_CONFIGURATION' in environment. " +
            "Make sure that environment variables were correctly exported to future processes. " +
            "See end of output from 'init' command for instructions.");
    }
}
program
    .command('init')
    .description('Initializes CodeQL')
    .requiredOption('--repository <repository>', 'Repository name')
    .requiredOption('--github-url <url>', 'URL of GitHub instance')
    .requiredOption('--github-auth <auth>', 'GitHub Apps token or personal access token')
    .option('--languages <languages>', 'Comma-separated list of languages to analyze. Defaults to trying to detect languages from the repo.')
    .option('--queries <queries>', 'Comma-separated list of additional queries to run. By default, this overrides the same setting in a configuration file.')
    .option('--config-file <file>', 'Path to config file')
    .option('--codeql-path <path>', 'Path to a copy of the CodeQL CLI executable to use. Otherwise downloads a copy.')
    .option('--temp-dir <dir>', 'Directory to use for temporary files. By default will use "./codeql-runner".')
    .option('--tools-dir <dir>', 'Directory to use for CodeQL tools and other files to store between runs. By default will use home directory.')
    .option('--checkout-path <path>', 'Checkout path (default: current working directory)')
    .option('--debug', 'Print more verbose output', false)
    .action(async (cmd) => {
    const logger = logging_1.getRunnerLogger(cmd.debug);
    try {
        const tempDir = getTempDir(cmd.tempDir);
        const toolsDir = getToolsDir(cmd.toolsDir);
        // Wipe the temp dir
        logger.info(`Cleaning temp directory ${tempDir}`);
        fs.rmdirSync(tempDir, { recursive: true });
        fs.mkdirSync(tempDir, { recursive: true });
        let codeql;
        if (cmd.codeqlPath !== undefined) {
            codeql = codeql_1.getCodeQL(cmd.codeqlPath);
        }
        else {
            codeql = await init_1.initCodeQL(undefined, cmd.githubAuth, parseGithubUrl(cmd.githubUrl), tempDir, toolsDir, 'runner', logger);
        }
        const config = await init_1.initConfig(cmd.languages, cmd.queries, cmd.configFile, repository_1.parseRepositoryNwo(cmd.repository), tempDir, toolsDir, codeql, cmd.checkoutPath || process.cwd(), cmd.githubAuth, parseGithubUrl(cmd.githubUrl), logger);
        const tracerConfig = await init_1.runInit(codeql, config);
        if (tracerConfig === undefined) {
            return;
        }
        if (process.platform === 'win32') {
            const batEnvFile = path.join(config.tempDir, 'codeql-env.bat');
            const batEnvFileContents = Object.entries(tracerConfig.env)
                .map(([key, value]) => `Set ${key}=${value}`)
                .join('\n');
            fs.writeFileSync(batEnvFile, batEnvFileContents);
            const powershellEnvFile = path.join(config.tempDir, 'codeql-env.sh');
            const powershellEnvFileContents = Object.entries(tracerConfig.env)
                .map(([key, value]) => `$env:${key}="${value}"`)
                .join('\n');
            fs.writeFileSync(powershellEnvFile, powershellEnvFileContents);
            logger.info(`\nCodeQL environment output to "${batEnvFileContents}" and "${powershellEnvFile}". ` +
                `Please export these variables to future processes so the build can be traced. ` +
                `If using cmd/batch run "call ${batEnvFileContents}" ` +
                `or if using PowerShell run "cat ${powershellEnvFile} | Invoke-Expression".`);
        }
        else {
            // Assume that anything that's not windows is using a unix-style shell
            const envFile = path.join(config.tempDir, 'codeql-env.sh');
            const envFileContents = Object.entries(tracerConfig.env)
                // Some vars contain ${LIB} that we do not want to be expanded when executing this script
                .map(([key, value]) => `export ${key}="${value.replace('$', '\\$')}"`)
                .join('\n');
            fs.writeFileSync(envFile, envFileContents);
            logger.info(`\nCodeQL environment output to "${envFile}". ` +
                `Please export these variables to future processes so the build can be traced, ` +
                `for example by running "source ${envFile}".`);
        }
    }
    catch (e) {
        logger.error('Init failed');
        logger.error(e);
        process.exitCode = 1;
    }
});
program
    .command('autobuild')
    .description('Attempts to automatically build code')
    .option('--language <language>', 'The language to build. By default will try to detect the dominant language.')
    .option('--temp-dir <dir>', 'Directory to use for temporary files. By default will use "./codeql-runner".')
    .option('--debug', 'Print more verbose output', false)
    .action(async (cmd) => {
    const logger = logging_1.getRunnerLogger(cmd.debug);
    try {
        const config = await config_utils_1.getConfig(getTempDir(cmd.tempDir), logger);
        checkEnvironmentSetup(config);
        let language = undefined;
        if (cmd.language !== undefined) {
            language = languages_1.parseLanguage(cmd.language);
            if (language === undefined || !config.languages.includes(language)) {
                throw new Error(`"${cmd.language}" is not a recognised language. ` +
                    `Known languages in this project are ${config.languages.join(', ')}.`);
            }
        }
        else {
            language = autobuild_1.determineAutobuildLanguage(config, logger);
        }
        if (language !== undefined) {
            await autobuild_1.runAutobuild(language, config, logger);
        }
    }
    catch (e) {
        logger.error('Autobuild failed');
        logger.error(e);
        process.exitCode = 1;
    }
});
program
    .command('analyze')
    .description('Finishes extracting code and runs CodeQL queries')
    .requiredOption('--repository <repository>', 'Repository name')
    .requiredOption('--commit <commit>', 'SHA of commit that was analyzed')
    .requiredOption('--ref <ref>', 'Name of ref that was analyzed')
    .requiredOption('--github-url <url>', 'URL of GitHub instance')
    .requiredOption('--github-auth <auth>', 'GitHub Apps token, or of the form "username:token" if using a personal access token')
    .option('--checkout-path <path>', 'Checkout path (default: current working directory)')
    .option('--no-upload', 'Do not upload results after analysis', false)
    .option('--output-dir <dir>', 'Directory to output SARIF files to. By default will use temp directory.')
    .option('--temp-dir <dir>', 'Directory to use for temporary files. By default will use "./codeql-runner".')
    .option('--debug', 'Print more verbose output', false)
    .action(async (cmd) => {
    const logger = logging_1.getRunnerLogger(cmd.debug);
    try {
        const tempDir = getTempDir(cmd.tempDir);
        const outputDir = cmd.outputDir || path.join(tempDir, 'codeql-sarif');
        const config = await config_utils_1.getConfig(getTempDir(cmd.tempDir), logger);
        checkEnvironmentSetup(config);
        await analyze_1.runAnalyze(repository_1.parseRepositoryNwo(cmd.repository), cmd.commit, cmd.ref, undefined, undefined, undefined, cmd.checkoutPath || process.cwd(), undefined, cmd.githubAuth, parseGithubUrl(cmd.githubUrl), cmd.upload, 'runner', outputDir, config, logger);
    }
    catch (e) {
        logger.error('Analyze failed');
        logger.error(e);
        process.exitCode = 1;
    }
});
program
    .command('upload')
    .description('Uploads a SARIF file, or all SARIF files from a directory, to code scanning')
    .requiredOption('--sarif-file <file>', 'SARIF file to upload; can also be a directory for uploading multiple')
    .requiredOption('--repository <repository>', 'Repository name')
    .requiredOption('--commit <commit>', 'SHA of commit that was analyzed')
    .requiredOption('--ref <ref>', 'Name of ref that was analyzed')
    .requiredOption('--github-url <url>', 'URL of GitHub instance')
    .requiredOption('--github-auth <auth>', 'GitHub Apps token, or of the form "username:token" if using a personal access token')
    .option('--checkout-path <path>', 'Checkout path (default: current working directory)')
    .option('--debug', 'Print more verbose output', false)
    .action(async (cmd) => {
    const logger = logging_1.getRunnerLogger(cmd.debug);
    try {
        await upload_lib.upload(cmd.sarifFile, repository_1.parseRepositoryNwo(cmd.repository), cmd.commit, cmd.ref, undefined, undefined, undefined, cmd.checkoutPath || process.cwd(), undefined, cmd.githubAuth, parseGithubUrl(cmd.githubUrl), 'runner', logger);
    }
    catch (e) {
        logger.error('Upload failed');
        logger.error(e);
        process.exitCode = 1;
    }
});
program.parse(process.argv);
//# sourceMappingURL=runner.js.map