import globby from 'globby';
import fs from 'fs-extra';
import path from 'path';
// @ts-ignore
import slash from 'slash2';

import { LineInfo, LocFile } from './file';

const defaultInfo: LineInfo = {
  total: 0,
  code: 0,
  comment: 0,
};

export interface LocDirOptions {
  cwd?: string;
  include?: string[] | string;
  exclude?: string[] | string;
}

export interface LocResult {
  files: string[];
  info: LineInfo;
  languages: {
    [key: string]: LineInfo & {
      sum: number;
    };
  };
}

const defaultExclude = [
  // javascript
  '**/*.map',
  '**/yarn**',
  '**/.github',
  '**/node_modules/**',
  '**/dist/**',
  '**/*.snap',

  // java
  '**/target'
];

/**
 * Collect the info of a directory.
 */
export class LocDir {
  private cwd: string;
  private include: string[];
  private exclude: string[];

  constructor(options: LocDirOptions) {

    // ensure all excludes are globstar. Note that '**/*.ts/**' matches files
    // that end in .ts because the globstar indicates 0 or more directory paths.
    this.exclude = ensureArray(options.exclude)
      .concat(defaultExclude)
      .map(item => item.endsWith('**') ? item : `${item}/**`);

    // remove all leading './' since this messes up globstar matches in the
    // excludes.
    this.include = ensureArray(options.include, '**')
      .map(item => item.startsWith('./') ? item.substring(2) : item)
      .map(item => item.endsWith('**') ? item : `${item}/**`);
    this.cwd = options.cwd || process.cwd();
  }

  /**
   * Calculate directory info.
   */
  async loadInfo(): Promise<LocResult> {
    const paths = await globby(this.include, {
      cwd: this.cwd,
      ignore: this.exclude,
      nodir: true
    });
    const files: string[] = [];
    const info: LineInfo = { ...defaultInfo };
    let languages: {
      [key: string]: LineInfo & {
        sum: number;
      };
    } = {};

    await Promise.all(paths.map(async (pathItem) => {
      const fullPath = slash(path.join(this.cwd, pathItem));
      if (
        !pathItem ||
        !(await fs.pathExists(fullPath)) ||
        (await fs.stat(fullPath)).isDirectory()
      ) {
        return;
      }
      const file = new LocFile(fullPath);
      const fileLineInfo = await file.getFileInfo();
      const { lines } = fileLineInfo;
      info.total += lines.total;
      info.code += lines.code;
      info.comment += lines.comment;
      const language = { ...languages[fileLineInfo.languages] };
      language.code = lines.code + (language.code || 0);
      language.sum = (language.sum || 0) + 1;
      language.comment = lines.comment + (language.comment || 0);
      language.total = lines.total + (language.total || 0);
      languages = {
        ...languages,
        [fileLineInfo.languages]: language,
      };
      files.push(fullPath);
    }));

    return {
      files,
      info,
      languages,
    };
  }
}

function ensureArray(arr?: string[] | string, dfault?: string) {
  if (!arr) {
    return dfault ? [dfault] : [];
  }
  return Array.isArray(arr)
    ? arr
    : [arr];
}
