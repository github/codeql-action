import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Command } from "commander";

import { runAnalyze } from "./analyze";
import { determineAutobuildLanguage, runAutobuild } from "./autobuild";
import { CodeQL, getCodeQL } from "./codeql";
import { Config, getConfig } from "./config-utils";
import { initCodeQL, initConfig, injectWindowsTracer, runInit } from "./init";
import { Language, parseLanguage } from "./languages";
import { getRunnerLogger } from "./logging";
import { parseRepositoryNwo } from "./repository";
import * as upload_lib from "./upload-lib";
import {
  getAddSnippetsFlag,
  getMemoryFlag,
  getThreadsFlag,
  parseGithubUrl,
} from "./util";

const program = new Command();
program.version("0.0.1");

function getTempDir(userInput: string | undefined): string {
  const tempDir = path.join(userInput || process.cwd(), "codeql-runner");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

function getToolsDir(userInput: string | undefined): string {
  const toolsDir = userInput || path.join(os.homedir(), "codeql-runner-tools");
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true });
  }
  return toolsDir;
}

const codeqlEnvJsonFilename = "codeql-env.json";

// Imports the environment from codeqlEnvJsonFilename if not already present
function importTracerEnvironment(config: Config) {
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
function parseRef(userInput: string): string {
  if (userInput.startsWith("refs/")) {
    return userInput;
  } else {
    return `refs/heads/${userInput}`;
  }
}

// Parses the --trace-process-name arg from process.argv, or returns undefined
function parseTraceProcessName(): string | undefined {
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === "--trace-process-name") {
      return process.argv[i + 1];
    }
  }
  return undefined;
}

// Parses the --trace-process-level arg from process.argv, or returns undefined
function parseTraceProcessLevel(): number | undefined {
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === "--trace-process-level") {
      const v = parseInt(process.argv[i + 1], 10);
      return isNaN(v) ? undefined : v;
    }
  }
  return undefined;
}

interface InitArgs {
  languages: string | undefined;
  queries: string | undefined;
  configFile: string | undefined;
  codeqlPath: string | undefined;
  tempDir: string | undefined;
  toolsDir: string | undefined;
  checkoutPath: string | undefined;
  repository: string;
  githubUrl: string;
  githubAuth: string;
  debug: boolean;
}

program
  .command("init")
  .description("Initializes CodeQL")
  .requiredOption("--repository <repository>", "Repository name. (Required)")
  .requiredOption("--github-url <url>", "URL of GitHub instance. (Required)")
  .requiredOption(
    "--github-auth <auth>",
    "GitHub Apps token or personal access token. (Required)"
  )
  .option(
    "--languages <languages>",
    "Comma-separated list of languages to analyze. Otherwise detects and analyzes all supported languages from the repo."
  )
  .option(
    "--queries <queries>",
    "Comma-separated list of additional queries to run. This overrides the same setting in a configuration file."
  )
  .option("--config-file <file>", "Path to config file.")
  .option(
    "--codeql-path <path>",
    "Path to a copy of the CodeQL CLI executable to use. Otherwise downloads a copy."
  )
  .option(
    "--temp-dir <dir>",
    'Directory to use for temporary files. Default is "./codeql-runner".'
  )
  .option(
    "--tools-dir <dir>",
    "Directory to use for CodeQL tools and other files to store between runs. Default is a subdirectory of the home directory."
  )
  .option(
    "--checkout-path <path>",
    "Checkout path. Default is the current working directory."
  )
  .option("--debug", "Print more verbose output", false)
  // This prevents a message like: error: unknown option '--trace-process-level'
  // Remove this if commander.js starts supporting hidden options.
  .allowUnknownOption()
  .action(async (cmd: InitArgs) => {
    const logger = getRunnerLogger(cmd.debug);
    try {
      const tempDir = getTempDir(cmd.tempDir);
      const toolsDir = getToolsDir(cmd.toolsDir);

      // Wipe the temp dir
      logger.info(`Cleaning temp directory ${tempDir}`);
      fs.rmdirSync(tempDir, { recursive: true });
      fs.mkdirSync(tempDir, { recursive: true });

      const apiDetails = {
        auth: cmd.githubAuth,
        url: parseGithubUrl(cmd.githubUrl),
      };

      let codeql: CodeQL;
      if (cmd.codeqlPath !== undefined) {
        codeql = getCodeQL(cmd.codeqlPath);
      } else {
        codeql = (
          await initCodeQL(
            undefined,
            apiDetails,
            tempDir,
            toolsDir,
            "runner",
            logger
          )
        ).codeql;
      }

      const config = await initConfig(
        cmd.languages,
        cmd.queries,
        cmd.configFile,
        parseRepositoryNwo(cmd.repository),
        tempDir,
        toolsDir,
        codeql,
        cmd.checkoutPath || process.cwd(),
        apiDetails,
        "runner",
        logger
      );

      const tracerConfig = await runInit(codeql, config);
      if (tracerConfig === undefined) {
        return;
      }

      if (process.platform === "win32") {
        await injectWindowsTracer(
          parseTraceProcessName(),
          parseTraceProcessLevel(),
          config,
          codeql,
          tracerConfig
        );
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

        logger.info(
          `\nCodeQL environment output to "${jsonEnvFile}", "${batEnvFile}" and "${powershellEnvFile}". ` +
            `Please export these variables to future processes so that CodeQL can monitor the build. ` +
            `If using cmd/batch run "call ${batEnvFile}" ` +
            `or if using PowerShell run "cat ${powershellEnvFile} | Invoke-Expression".`
        );
      } else {
        // Assume that anything that's not windows is using a unix-style shell
        const shEnvFile = path.join(config.tempDir, "codeql-env.sh");
        const shEnvFileContents = Object.entries(tracerConfig.env)
          // Some vars contain ${LIB} that we do not want to be expanded when executing this script
          .map(
            ([key, value]) => `export ${key}="${value.replace(/\$/g, "\\$")}"`
          )
          .join("\n");
        fs.writeFileSync(shEnvFile, shEnvFileContents);

        logger.info(
          `\nCodeQL environment output to "${jsonEnvFile}" and "${shEnvFile}". ` +
            `Please export these variables to future processes so that CodeQL can monitor the build, ` +
            `for example by running ". ${shEnvFile}".`
        );
      }
    } catch (e) {
      logger.error("Init failed");
      logger.error(e);
      process.exitCode = 1;
    }
  });

interface AutobuildArgs {
  language: string;
  tempDir: string | undefined;
  debug: boolean;
}

program
  .command("autobuild")
  .description("Attempts to automatically build code")
  .option(
    "--language <language>",
    "The language to build. Otherwise will detect the dominant compiled language."
  )
  .option(
    "--temp-dir <dir>",
    'Directory to use for temporary files. Default is "./codeql-runner".'
  )
  .option("--debug", "Print more verbose output", false)
  .action(async (cmd: AutobuildArgs) => {
    const logger = getRunnerLogger(cmd.debug);
    try {
      const config = await getConfig(getTempDir(cmd.tempDir), logger);
      if (config === undefined) {
        throw new Error(
          "Config file could not be found at expected location. " +
            "Was the 'init' command run with the same '--temp-dir' argument as this command."
        );
      }
      importTracerEnvironment(config);
      let language: Language | undefined = undefined;
      if (cmd.language !== undefined) {
        language = parseLanguage(cmd.language);
        if (language === undefined || !config.languages.includes(language)) {
          throw new Error(
            `"${cmd.language}" is not a recognised language. ` +
              `Known languages in this project are ${config.languages.join(
                ", "
              )}.`
          );
        }
      } else {
        language = determineAutobuildLanguage(config, logger);
      }
      if (language !== undefined) {
        await runAutobuild(language, config, logger);
      }
    } catch (e) {
      logger.error("Autobuild failed");
      logger.error(e);
      process.exitCode = 1;
    }
  });

interface AnalyzeArgs {
  repository: string;
  commit: string;
  ref: string;
  githubUrl: string;
  githubAuth: string;
  checkoutPath: string | undefined;
  upload: boolean;
  outputDir: string | undefined;
  ram: string | undefined;
  addSnippets: boolean;
  threads: string | undefined;
  tempDir: string | undefined;
  debug: boolean;
}

program
  .command("analyze")
  .description("Finishes extracting code and runs CodeQL queries")
  .requiredOption("--repository <repository>", "Repository name. (Required)")
  .requiredOption(
    "--commit <commit>",
    "SHA of commit that was analyzed. (Required)"
  )
  .requiredOption("--ref <ref>", "Name of ref that was analyzed. (Required)")
  .requiredOption("--github-url <url>", "URL of GitHub instance. (Required)")
  .requiredOption(
    "--github-auth <auth>",
    "GitHub Apps token or personal access token. (Required)"
  )
  .option(
    "--checkout-path <path>",
    "Checkout path. Default is the current working directory."
  )
  .option("--no-upload", "Do not upload results after analysis.")
  .option(
    "--output-dir <dir>",
    "Directory to output SARIF files to. Default is in the temp directory."
  )
  .option(
    "--ram <ram>",
    "Amount of memory to use when running queries. Default is to use all available memory."
  )
  .option(
    "--no-add-snippets",
    "Specify whether to include code snippets in the sarif output."
  )
  .option(
    "--threads <threads>",
    "Number of threads to use when running queries. " +
      "Default is to use all available cores."
  )
  .option(
    "--temp-dir <dir>",
    'Directory to use for temporary files. Default is "./codeql-runner".'
  )
  .option("--debug", "Print more verbose output", false)
  .action(async (cmd: AnalyzeArgs) => {
    const logger = getRunnerLogger(cmd.debug);
    try {
      const tempDir = getTempDir(cmd.tempDir);
      const outputDir = cmd.outputDir || path.join(tempDir, "codeql-sarif");
      const config = await getConfig(getTempDir(cmd.tempDir), logger);
      if (config === undefined) {
        throw new Error(
          "Config file could not be found at expected location. " +
            "Was the 'init' command run with the same '--temp-dir' argument as this command."
        );
      }

      const apiDetails = {
        auth: cmd.githubAuth,
        url: parseGithubUrl(cmd.githubUrl),
      };

      await runAnalyze(
        outputDir,
        getMemoryFlag(cmd.ram),
        getAddSnippetsFlag(cmd.addSnippets),
        getThreadsFlag(cmd.threads, logger),
        config,
        logger
      );

      if (!cmd.upload) {
        logger.info("Not uploading results");
        return;
      }
      
      await upload_lib.uploadFromRunner(
        outputDir,
        parseRepositoryNwo(cmd.repository),
        cmd.commit,
        parseRef(cmd.ref),
        cmd.checkoutPath || process.cwd(),
        apiDetails,
        logger
      );
    } catch (e) {
      logger.error("Analyze failed");
      logger.error(e);
      process.exitCode = 1;
    }
  });

interface UploadArgs {
  sarifFile: string;
  repository: string;
  commit: string;
  ref: string;
  githubUrl: string;
  githubAuth: string;
  checkoutPath: string | undefined;
  debug: boolean;
}

program
  .command("upload")
  .description(
    "Uploads a SARIF file, or all SARIF files from a directory, to code scanning"
  )
  .requiredOption(
    "--sarif-file <file>",
    "SARIF file to upload, or a directory containing multiple SARIF files. (Required)"
  )
  .requiredOption("--repository <repository>", "Repository name. (Required)")
  .requiredOption(
    "--commit <commit>",
    "SHA of commit that was analyzed. (Required)"
  )
  .requiredOption("--ref <ref>", "Name of ref that was analyzed. (Required)")
  .requiredOption("--github-url <url>", "URL of GitHub instance. (Required)")
  .requiredOption(
    "--github-auth <auth>",
    "GitHub Apps token or personal access token. (Required)"
  )
  .option(
    "--checkout-path <path>",
    "Checkout path. Default is the current working directory."
  )
  .option("--debug", "Print more verbose output", false)
  .action(async (cmd: UploadArgs) => {
    const logger = getRunnerLogger(cmd.debug);
    const apiDetails = {
      auth: cmd.githubAuth,
      url: parseGithubUrl(cmd.githubUrl),
    };
    try {
      await upload_lib.uploadFromRunner(
        cmd.sarifFile,
        parseRepositoryNwo(cmd.repository),
        cmd.commit,
        parseRef(cmd.ref),
        cmd.checkoutPath || process.cwd(),
        apiDetails,
        logger
      );
    } catch (e) {
      logger.error("Upload failed");
      logger.error(e);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
