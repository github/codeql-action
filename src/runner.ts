import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { runAnalyze } from './analyze';
import { runAutobuild } from './autobuild';
import { CodeQL, getCodeQL } from './codeql';
import { initCodeQL, initConfig, runInit } from './init';
import { parseLanguage } from './languages';
import { getRunnerLogger } from './logging';
import { parseRepositoryNwo } from './repository';
import * as upload_lib from './upload-lib';

const program = new Command();
program.version('0.0.1');

function parseGithubUrl(inputUrl: string): string {
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

  } catch (e) {
    throw new Error(`"${inputUrl}" is not a valid URL`);
  }
}

function getTempDir(userInput: string | undefined): string {
  const tempDir = path.join(userInput || os.tmpdir(), 'codeql-runner-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

function getToolsDir(userInput: string | undefined, tmpDir: string): string {
  const toolsDir = path.join(userInput || path.dirname(tmpDir), 'codeql-runner-tools');
  if (!fs.existsSync(toolsDir)) {
    fs.mkdirSync(toolsDir, { recursive: true });
  }
  return toolsDir;
}

const logger = getRunnerLogger();

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
}

program
  .command('init')
  .description('Initializes CodeQL')
  .requiredOption('--repository <repository>', 'Repository name')
  .requiredOption('--github-url <url>', 'URL of GitHub instance')
  .requiredOption('--github-auth <auth>', 'GitHub Apps token, or of the form "username:token" if using a personal access token')
  .option('--languages <languages>', 'Comma-separated list of languages to analyze. Defaults to trying to detect languages from the repo.')
  .option('--queries <queries>', 'Comma-separated list of additional queries to run. By default, this overrides the same setting in a configuration file.')
  .option('--config-file <file>', 'Path to config file')
  .option('--codeql-path <path>', 'Path to a copy of the CodeQL CLI executable to use. Otherwise downloads a copy.')
  .option('--temp-dir <dir>', 'Directory to use for temporary files. Defaults to OS temp dir.')
  .option('--tools-dir <dir>', 'Directory to use for CodeQL tools and other files to store between runs. Defaults to same as temp dir.')
  .option('--checkout-path <path>', 'Checkout path (default: current working directory)')
  .action(async (cmd: InitArgs) => {
    try {
      const tempDir = getTempDir(cmd.tempDir);
      const toolsDir = getToolsDir(cmd.toolsDir, tempDir);

      // Wipe the temp dir
      fs.rmdirSync(tempDir, { recursive: true });
      fs.mkdirSync(tempDir, { recursive: true });

      let codeql: CodeQL;
      if (cmd.codeqlPath !== undefined) {
        codeql = getCodeQL(cmd.codeqlPath);
      } else {
        codeql = await initCodeQL(
          undefined,
          cmd.githubAuth,
          parseGithubUrl(cmd.githubUrl),
          tempDir,
          toolsDir,
          'runner',
          logger);
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
        cmd.githubAuth,
        parseGithubUrl(cmd.githubUrl),
        logger);

      const tracerConfig = await runInit(codeql, config);
      if (tracerConfig !== undefined) {
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

          logger.info(`\nCodeQL environment outputted to "${batEnvFileContents}" and "${powershellEnvFile}". ` +
            `Please export these variables to future processes so the build can tbe traced. ` +
            `If using cmd/batch run "call ${batEnvFileContents}" ` +
            `or if using PowerShell run "cat ${powershellEnvFile} | Invoke-Expression".`);

        } else {
          // Assume that anything that's not windows is using a unix-style shell
          const envFile = path.join(config.tempDir, 'codeql-env.sh');
          const envFileContents = Object.entries(tracerConfig.env)
            // Some vars contain ${LIB} that we do not want to be expanded when executing this script
            .map(([key, value]) => `export ${key}="${value.replace('$', '\\$')}"`)
            .join('\n');
          fs.writeFileSync(envFile, envFileContents);

          logger.info(`\nCodeQL environment outputted to "${envFile}". ` +
            `Please export these variables to future processes so the build can tbe traced, ` +
            `for example by running "source ${envFile}".`);
        }
      }

    } catch (e) {
      logger.error('Init failed');
      logger.error(e);
      process.exitCode = 1;
    }
  });

interface AutobuildArgs {
  language: string;
  tempDir: string | undefined;
}

program
  .command('autobuild')
  .description('Attempts to automatically build code')
  .requiredOption('--language <language>', 'The language to build')
  .option('--temp-dir <dir>', 'Directory to use for temporary files. Defaults to OS temp dir.')
  .action(async (cmd: AutobuildArgs) => {
    try {
      const language = parseLanguage(cmd.language);
      if (language === undefined) {
        throw new Error(`"${cmd.language}" is not a recognised language`);
      }
      await runAutobuild(
        language,
        getTempDir(cmd.tempDir),
        logger);
    } catch (e) {
      logger.error('Autobuild failed');
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
  tempDir: string | undefined;
}

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
  .option('--temp-dir <dir>', 'Directory to use for temporary files. Defaults to OS temp dir.')
  .action(async (cmd: AnalyzeArgs) => {
    try {
      const tempDir = getTempDir(cmd.tempDir);
      const outputDir = cmd.outputDir || path.join(tempDir, 'codeql-sarif');
      await runAnalyze(
        parseRepositoryNwo(cmd.repository),
        cmd.commit,
        cmd.ref,
        undefined,
        undefined,
        undefined,
        cmd.checkoutPath || process.cwd(),
        undefined,
        cmd.githubAuth,
        parseGithubUrl(cmd.githubUrl),
        cmd.upload,
        'runner',
        outputDir,
        tempDir,
        logger);
    } catch (e) {
      logger.error('Upload failed');
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
}

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
  .action(async (cmd: UploadArgs) => {
    try {
      await upload_lib.upload(
        cmd.sarifFile,
        parseRepositoryNwo(cmd.repository),
        cmd.commit,
        cmd.ref,
        undefined,
        undefined,
        undefined,
        cmd.checkoutPath || process.cwd(),
        undefined,
        cmd.githubAuth,
        parseGithubUrl(cmd.githubUrl),
        'runner',
        logger);
    } catch (e) {
      logger.error('Upload failed');
      logger.error(e);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
