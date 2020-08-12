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
  githubUrl: string;
  githubAuth: string;
  checkoutPath: string | undefined;
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

const logger = getCLILogger();

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
        parseGithubApiUrl(cmd.githubUrl),
        'cli',
        logger);
    } catch (e) {
      logger.error('Upload failed');
      logger.error(e);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
