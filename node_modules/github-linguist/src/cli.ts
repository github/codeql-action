#!/usr/bin/env node

import chalk from 'chalk';
import program from 'commander';

import { LocDir } from './directory';
import { LocFile, LineInfo } from './file';
import { getVersion } from './utils';

program
  .version(getVersion(), '-v')
  .command('file <path>')
  .description('count lines of code in a file')
  .action(async (pathPattern) => {
    try {
      const info = await (new LocFile(pathPattern).getFileInfo());
      // eslint-disable-next-line no-console
      console.log(
        chalk.cyan(`
        path: \t\t${pathPattern}
        language: \t${info.languages}
        total lines: \t${String(info.lines.total)}
        code lines: \t${String(info.lines.code)}
        comment lines: \t${String(info.lines.comment)}
      `),
      );
    } catch (e) {
      console.error(e);
      console.error(e.stacl);
    }
  });

const formatInfo = (
  info: LineInfo,
  languages: {
    [key: string]: LineInfo & {
      sum: number;
    };
  },
) => `
  \ttotal lines: \t${String(info.total)}
  \tcode lines: \t${String(info.code)}
  \tcomment lines: \t${String(info.comment)}
  \t--------------------${Object.keys(languages)
    .map((key) => {
      const languageInfo = languages[key];
      return `\n\t${key.padEnd(10)} \t file count:${String(languageInfo.sum)} \ttotal:${String(
        languageInfo.total,
      )}  \tcomment:${String(languageInfo.comment)}  \tcode:${String(languageInfo.code)}`;
    })
    .join('')}`;

program.arguments('<cmd> [env]').action(async (cmd) => {
  try {
    const { info, languages } = await (new LocDir({
      include: cmd
    }).loadInfo());
    // eslint-disable-next-line no-console
    console.log(chalk.cyan(formatInfo(info, languages)));
  } catch (e) {
    console.error(e);
    console.error(e.stacl);
  }
});

program.parse(process.argv);
