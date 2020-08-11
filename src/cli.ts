import { Command } from 'commander';
import * as path from 'path';

import { getCLILogger } from './logging';
import { parseRepositoryNwo } from './repository';
import * as upload_lib from './upload-lib';

const program = new Command();
program.version('0.0.1');

interface UploadArgs {
  sarifFile: string;
  repository: string;
  commit: string;
  ref: string;
  analysisKey: string;
  githubUrl: string;
  githubAuth: string;
  analysisName: string | undefined;
  checkoutPath: string | undefined;
  environment: string | undefined;
}

function parseGithubApiUrl(inputUrl: string): string {
  try {
    const url = new URL(inputUrl);

    // If we detect this is trying to be to github.com
    // then return with a fixed canonical URL.
    if (url.hostname === 'github.com' || url.hostname === 'api.github.com') {
      return 'https://api.github.com';
    }

    // Add the API path if it's not already present.
    if (url.pathname.indexOf('/api/v3') === -1) {
      url.pathname = path.join(url.pathname, 'api', 'v3');
    }

    return url.toString();

  } catch (e) {
    throw new Error(`"${inputUrl}" is not a valid URL`);
  }
}

program
  .command('upload')
  .description('Uploads a SARIF file, or all SARIF files from a directory, to code scanning')
  .requiredOption('--sarif-file <file>', 'SARIF file to upload')
  .requiredOption('--repository <repository>', 'Repository name')
  .requiredOption('--commit <commit>', 'SHA of commit that was analyzed')
  .requiredOption('--ref <ref>', 'Name of ref that was analyzed')
  .requiredOption('--analysis-key <key>', 'Identifies the analysis, for use matching up equivalent analyses on different commits')
  .requiredOption('--github-url <url>', 'URL of GitHub instance')
  .requiredOption('--github-auth <auth>', 'GitHub Apps token, or of the form "username:token" if using a personal access token')
  .option('--checkout-path <path>', 'Checkout path (default: current working directory)')
  .option('--analysis-name <name>', 'Display name of the analysis (default: same as analysis-key')
  .option('--environment <env>', 'Environment (default: empty)')
  .action(async (cmd: UploadArgs) => {
    const logger = getCLILogger();
    try {
      await upload_lib.upload(
        cmd.sarifFile,
        parseRepositoryNwo(cmd.repository),
        cmd.commit,
        cmd.ref,
        cmd.analysisKey,
        cmd.analysisName || cmd.analysisKey,
        undefined,
        cmd.checkoutPath || process.cwd(),
        cmd.environment,
        cmd.githubAuth,
        parseGithubApiUrl(cmd.githubUrl),
        'cli',
        logger);
    } catch (e) {
      logger.error("Upload failed");
      logger.error(e);
    }
  });

program.parse(process.argv);
