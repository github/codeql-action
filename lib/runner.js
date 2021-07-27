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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const commander_1 = require("commander");
const analyze_1 = require("./analyze");
const autobuild_1 = require("./autobuild");
const codeql_1 = require("./codeql");
const config_utils_1 = require("./config-utils");
const init_1 = require("./init");
const languages_1 = require("./languages");
const logging_1 = require("./logging");
const repository_1 = require("./repository");
const upload_lib = __importStar(require("./upload-lib"));
const util_1 = require("./util");
// eslint-disable-next-line import/no-commonjs
const pkg = require("../package.json");
const program = new commander_1.Command();
program.version(pkg.version).hook("preAction", () => {
    util_1.initializeEnvironment(util_1.Mode.runner, pkg.version);
});
function getTempDir(userInput) {
    const tempDir = path.join(userInput || process.cwd(), "codeql-runner");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}
function getToolsDir(userInput) {
    const toolsDir = userInput || path.join(os.homedir(), "codeql-runner-tools");
    if (!fs.existsSync(toolsDir)) {
        fs.mkdirSync(toolsDir, { recursive: true });
    }
    return toolsDir;
}
const codeqlEnvJsonFilename = "codeql-env.json";
// Imports the environment from codeqlEnvJsonFilename if not already present
function importTracerEnvironment(config) {
    if (!("ODASA_TRACER_CONFIGURATION" in process.env)) {
        const jsonEnvFile = path.join(config.tempDir, codeqlEnvJsonFilename);
        const env = JSON.parse(fs.readFileSync(jsonEnvFile).toString("utf-8"));
        for (const key of Object.keys(env)) {
            process.env[key] = env[key];
        }
    }
}
// Allow the user to specify refs in full refs/heads/branch format
// or just the short branch name and prepend "refs/heads/" to it.
function parseRef(userInput) {
    if (userInput.startsWith("refs/")) {
        return userInput;
    }
    else {
        return `refs/heads/${userInput}`;
    }
}
// Parses the --trace-process-name arg from process.argv, or returns undefined
function parseTraceProcessName() {
    for (let i = 0; i < process.argv.length - 1; i++) {
        if (process.argv[i] === "--trace-process-name") {
            return process.argv[i + 1];
        }
    }
    return undefined;
}
// Parses the --trace-process-level arg from process.argv, or returns undefined
function parseTraceProcessLevel() {
    for (let i = 0; i < process.argv.length - 1; i++) {
        if (process.argv[i] === "--trace-process-level") {
            const v = parseInt(process.argv[i + 1], 10);
            return isNaN(v) ? undefined : v;
        }
    }
    return undefined;
}
program
    .command("init")
    .description("Initializes CodeQL")
    .requiredOption("--repository <repository>", "Repository name. (Required)")
    .requiredOption("--github-url <url>", "URL of GitHub instance. (Required)")
    .option("--github-auth <auth>", "GitHub Apps token or personal access token. This option is insecure and deprecated, please use `--github-auth-stdin` instead.")
    .option("--github-auth-stdin", "Read GitHub Apps token or personal access token from stdin.")
    .option("--languages <languages>", "Comma-separated list of languages to analyze. Otherwise detects and analyzes all supported languages from the repo.")
    .option("--queries <queries>", "Comma-separated list of additional queries to run. This overrides the same setting in a configuration file.")
    .option("--packs <packs>", `[Experimental] Comma-separated list of packs to run. Reference a pack in the format scope/name[@version]. If version is not
    specified, then the latest version of the pack is used. By default, this overrides the same setting in a
    configuration file; prefix with "+" to use both sets of packs.

    This option is only available in single-language analyses. To use packs in multi-language
    analyses, you must specify packs in the codeql-config.yml file.`)
    .option("--config-file <file>", "Path to config file.")
    .option("--codeql-path <path>", "Path to a copy of the CodeQL CLI executable to use. Otherwise downloads a copy.")
    .option("--temp-dir <dir>", 'Directory to use for temporary files. Default is "./codeql-runner".')
    .option("--tools-dir <dir>", "Directory to use for CodeQL tools and other files to store between runs. Default is a subdirectory of the home directory.")
    .option("--checkout-path <path>", "Checkout path. Default is the current working directory.")
    .option("--debug", "Print more verbose output", false)
    .option("--trace-process-name <string>", "(Advanced, windows-only) Inject a windows tracer of this process into a process with the given process name.")
    .option("--trace-process-level <number>", "(Advanced, windows-only) Inject a windows tracer of this process into a parent process <number> levels up.")
    .action(async (cmd) => {
    const logger = logging_1.getRunnerLogger(cmd.debug);
    try {
        const tempDir = getTempDir(cmd.tempDir);
        const toolsDir = getToolsDir(cmd.toolsDir);
        const checkoutPath = cmd.checkoutPath || process.cwd();
        // Wipe the temp dir
        logger.info(`Cleaning temp directory ${tempDir}`);
        fs.rmdirSync(tempDir, { recursive: true });
        fs.mkdirSync(tempDir, { recursive: true });
        const auth = await util_1.getGitHubAuth(logger, cmd.githubAuth, cmd.githubAuthStdin);
        const apiDetails = {
            auth,
            externalRepoAuth: auth,
            url: util_1.parseGitHubUrl(cmd.githubUrl),
        };
        const gitHubVersion = await util_1.getGitHubVersion(apiDetails);
        util_1.checkGitHubVersionInRange(gitHubVersion, logger, util_1.Mode.runner);
        let codeql;
        if (cmd.codeqlPath !== undefined) {
            codeql = codeql_1.getCodeQL(cmd.codeqlPath);
        }
        else {
            codeql = (await init_1.initCodeQL(undefined, apiDetails, tempDir, toolsDir, gitHubVersion.type, logger)).codeql;
        }
        const workspacePath = checkoutPath;
        const config = await init_1.initConfig(cmd.languages, cmd.queries, cmd.packs, cmd.configFile, undefined, repository_1.parseRepositoryNwo(cmd.repository), tempDir, toolsDir, codeql, workspacePath, gitHubVersion, apiDetails, logger);
        const sourceRoot = checkoutPath;
        const tracerConfig = await init_1.runInit(codeql, config, sourceRoot);
        if (tracerConfig === undefined) {
            return;
        }
        if (process.platform === "win32") {
            await init_1.injectWindowsTracer(parseTraceProcessName(), parseTraceProcessLevel(), config, codeql, tracerConfig);
        }
        // Always output a json file of the env that can be consumed programmatically
        const jsonEnvFile = path.join(config.tempDir, codeqlEnvJsonFilename);
        fs.writeFileSync(jsonEnvFile, JSON.stringify(tracerConfig.env));
        if (process.platform === "win32") {
            const batEnvFile = path.join(config.tempDir, "codeql-env.bat");
            const batEnvFileContents = Object.entries(tracerConfig.env)
                .map(([key, value]) => `Set ${key}=${value}`)
                .join("\n");
            fs.writeFileSync(batEnvFile, batEnvFileContents);
            const powershellEnvFile = path.join(config.tempDir, "codeql-env.sh");
            const powershellEnvFileContents = Object.entries(tracerConfig.env)
                .map(([key, value]) => `$env:${key}="${value}"`)
                .join("\n");
            fs.writeFileSync(powershellEnvFile, powershellEnvFileContents);
            logger.info(`\nCodeQL environment output to "${jsonEnvFile}", "${batEnvFile}" and "${powershellEnvFile}". ` +
                `Please export these variables to future processes so that CodeQL can monitor the build. ` +
                `If using cmd/batch run "call ${batEnvFile}" ` +
                `or if using PowerShell run "cat ${powershellEnvFile} | Invoke-Expression".`);
        }
        else {
            // Assume that anything that's not windows is using a unix-style shell
            const shEnvFile = path.join(config.tempDir, "codeql-env.sh");
            const shEnvFileContents = Object.entries(tracerConfig.env)
                // Some vars contain ${LIB} that we do not want to be expanded when executing this script
                .map(([key, value]) => `export ${key}='${value.replace(/'/g, "'\"'\"'")}'`)
                .join("\n");
            fs.writeFileSync(shEnvFile, shEnvFileContents);
            logger.info(`\nCodeQL environment output to "${jsonEnvFile}" and "${shEnvFile}". ` +
                `Please export these variables to future processes so that CodeQL can monitor the build, ` +
                `for example by running ". ${shEnvFile}".`);
        }
    }
    catch (e) {
        logger.error("Init failed");
        logger.error(e);
        process.exitCode = 1;
    }
});
program
    .command("autobuild")
    .description("Attempts to automatically build code")
    .option("--language <language>", "The language to build. Otherwise will detect the dominant compiled language.")
    .option("--temp-dir <dir>", 'Directory to use for temporary files. Default is "./codeql-runner".')
    .option("--debug", "Print more verbose output", false)
    .action(async (cmd) => {
    const logger = logging_1.getRunnerLogger(cmd.debug);
    try {
        const config = await config_utils_1.getConfig(getTempDir(cmd.tempDir), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. " +
                "Was the 'init' command run with the same '--temp-dir' argument as this command.");
        }
        importTracerEnvironment(config);
        let language = undefined;
        if (cmd.language !== undefined) {
            language = languages_1.parseLanguage(cmd.language);
            if (language === undefined || !config.languages.includes(language)) {
                throw new Error(`"${cmd.language}" is not a recognised language. ` +
                    `Known languages in this project are ${config.languages.join(", ")}.`);
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
        logger.error("Autobuild failed");
        logger.error(e);
        process.exitCode = 1;
    }
});
program
    .command("analyze")
    .description("Finishes extracting code and runs CodeQL queries")
    .requiredOption("--repository <repository>", "Repository name. (Required)")
    .requiredOption("--commit <commit>", "SHA of commit that was analyzed. (Required)")
    .requiredOption("--ref <ref>", "Name of ref that was analyzed. (Required)")
    .requiredOption("--github-url <url>", "URL of GitHub instance. (Required)")
    .option("--github-auth <auth>", "GitHub Apps token or personal access token. This option is insecure and deprecated, please use `--github-auth-stdin` instead.")
    .option("--github-auth-stdin", "Read GitHub Apps token or personal access token from stdin.")
    .option("--checkout-path <path>", "Checkout path. Default is the current working directory.")
    .option("--no-upload", "Do not upload results after analysis.")
    .option("--output-dir <dir>", "Directory to output SARIF files to. Default is in the temp directory.")
    .option("--ram <ram>", "Amount of memory to use when running queries. Default is to use all available memory.")
    .option("--no-add-snippets", "Specify whether to include code snippets in the sarif output.")
    .option("--threads <threads>", "Number of threads to use when running queries. " +
    "Default is to use all available cores.")
    .option("--temp-dir <dir>", 'Directory to use for temporary files. Default is "./codeql-runner".')
    .option("--category <category>", "String used by Code Scanning for matching the analyses.")
    .option("--debug", "Print more verbose output", false)
    .action(async (cmd) => {
    const logger = logging_1.getRunnerLogger(cmd.debug);
    try {
        const config = await config_utils_1.getConfig(getTempDir(cmd.tempDir), logger);
        if (config === undefined) {
            throw new Error("Config file could not be found at expected location. " +
                "Was the 'init' command run with the same '--temp-dir' argument as this command.");
        }
        const auth = await util_1.getGitHubAuth(logger, cmd.githubAuth, cmd.githubAuthStdin);
        const apiDetails = {
            auth,
            url: util_1.parseGitHubUrl(cmd.githubUrl),
        };
        const outputDir = cmd.outputDir || path.join(config.tempDir, "codeql-sarif");
        const threads = util_1.getThreadsFlag(cmd.threads, logger);
        await analyze_1.runFinalize(outputDir, threads, config, logger);
        await analyze_1.runQueries(outputDir, util_1.getMemoryFlag(cmd.ram), util_1.getAddSnippetsFlag(cmd.addSnippets), threads, cmd.category, config, logger);
        if (!cmd.upload) {
            logger.info("Not uploading results");
            return;
        }
        const sourceRoot = cmd.checkoutPath || process.cwd();
        await upload_lib.uploadFromRunner(outputDir, repository_1.parseRepositoryNwo(cmd.repository), cmd.commit, parseRef(cmd.ref), cmd.category, sourceRoot, config.gitHubVersion, apiDetails, logger);
    }
    catch (e) {
        logger.error("Analyze failed");
        logger.error(e);
        process.exitCode = 1;
    }
});
program
    .command("upload")
    .description("Uploads a SARIF file, or all SARIF files from a directory, to code scanning")
    .requiredOption("--sarif-file <file>", "SARIF file to upload, or a directory containing multiple SARIF files. (Required)")
    .requiredOption("--repository <repository>", "Repository name. (Required)")
    .requiredOption("--commit <commit>", "SHA of commit that was analyzed. (Required)")
    .requiredOption("--ref <ref>", "Name of ref that was analyzed. (Required)")
    .requiredOption("--github-url <url>", "URL of GitHub instance. (Required)")
    .option("--github-auth <auth>", "GitHub Apps token or personal access token. This option is insecure and deprecated, please use `--github-auth-stdin` instead.")
    .option("--github-auth-stdin", "Read GitHub Apps token or personal access token from stdin.")
    .option("--checkout-path <path>", "Checkout path. Default is the current working directory.")
    .option("--category <category>", "String used by Code Scanning for matching the analyses.")
    .option("--debug", "Print more verbose output", false)
    .action(async (cmd) => {
    const logger = logging_1.getRunnerLogger(cmd.debug);
    const auth = await util_1.getGitHubAuth(logger, cmd.githubAuth, cmd.githubAuthStdin);
    const apiDetails = {
        auth,
        url: util_1.parseGitHubUrl(cmd.githubUrl),
    };
    try {
        const gitHubVersion = await util_1.getGitHubVersion(apiDetails);
        const sourceRoot = cmd.checkoutPath || process.cwd();
        await upload_lib.uploadFromRunner(cmd.sarifFile, repository_1.parseRepositoryNwo(cmd.repository), cmd.commit, parseRef(cmd.ref), cmd.category, sourceRoot, gitHubVersion, apiDetails, logger);
    }
    catch (e) {
        logger.error("Upload failed");
        logger.error(e);
        process.exitCode = 1;
    }
});
program.parse(process.argv);
//# sourceMappingURL=runner.js.map