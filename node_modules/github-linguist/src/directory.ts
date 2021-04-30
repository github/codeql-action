import globby from 'globby';
import fs from 'fs-extra';
import path from 'path';
// @ts-ignore
import slash from 'slash2';

import { LineInfo, LocFile } from './file';
import { Languages } from './languages';

const defaultInfo: LineInfo = {
  total: 0,
  code: 0,
  comment: 0,
};

export interface LocDirOptions {
  cwd?: string;
  include?: string[] | string;
  exclude?: string[] | string;
  analysisLanguages?: string[];
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
  '**/target',
  "**/*.class",
  "**/*.o",
  "**/bin",
  "**/*.map",

  // python
  "**/*.pyc",
  "**/*.pyo",

  // other
  "**/*.dil",
  "**/*.ra",

  // images
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.ico',
  '**/*.bmp',
  '**/*.webp',
  '**/*.tiff',
  '**/*.psd',
  '**/*.ai',
  '**/*.ps',
  '**/*.eps',

  // fonts
  '**/*.ttf',
  '**/*.otf',
  '**/*.woff',
  '**/*.woff2',
  '**/*.eot',
  '**/*.ttc',

  // audio
  '**/*.mp3',
  '**/*.wav',
  '**/*.ogg',
  '**/*.flac',
  '**/*.aac',
  '**/*.m4a',
  '**/*.aif*',

  // video
  '**/*.mp4',
  '**/*.mkv',
  '**/*.avi',
  '**/*.mov',
  '**/*.wmv',
  '**/*.mpg',
  '**/*.mpeg',
  '**/*.m2v',
  '**/*.m4v',

  // office
  '**/*.doc',
  '**/*.docx',
  '**/*.docm',
  '**/*.dot',
  '**/*.dotx',
  '**/*.xls',
  '**/*.xlsx',

  // documents
  '**/*.pdf',
  '**/*.epub',
  '**/*.mobi',

  // archives
  '**/*.rar',
  '**/*.zip',
  '**/*.7z',
  '**/*.tar',
  '**/*.gz',
  '**/*.bz2',
  '**/*.bz',
  '**/*.tbz',
  '**/*.tgz',
];

/**
 * Collect the info of a directory.
 */
export class LocDir {
  private cwd: string;
  private include: string[];
  private exclude: string[];
  private analysisLanguages?: string[];
  private allLanguages = new Languages();

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
    this.analysisLanguages = options.analysisLanguages;
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
        this.ignoreLanguage(pathItem) ||
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

  /**
   * Ignore analyzing this file if analysis languages are specified
   * and this language is not one of them.
   */
  private ignoreLanguage(pathItem: string): boolean {
    return this.analysisLanguages && !this.analysisLanguages.includes(this.allLanguages.getType(pathItem));
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
