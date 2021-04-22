/**
 * detect file info
 */

import * as fs from 'fs-extra';
import * as Path from 'path';
// @ts-ignore
import slash from 'slash2';

import { Languages, Regexes } from './languages';

export interface LineInfo {
  total: number;
  code: number;
  comment: number;
}

export interface FileInfo {
  name: string;
  languages: string;
  size: number;
  lines: LineInfo;
}

const DefaultLine: LineInfo = {
  total: 0,
  code: 0,
  comment: 0,
};

const DefaultFileInfo: FileInfo = {
  name: '',
  languages: '',
  size: 0,
  lines: DefaultLine,
};

/**
 * Collect language info for a single file
 */
export class LocFile {
  public path: string;
  private rawPath: string;

  private language = new Languages();

  /**
   * Creates an instance of LocFile.
   */
  constructor(rawPath: string, private debug = false) {
    this.path = slash(rawPath);
    this.rawPath = rawPath;
  }

  /**
   * get file type through a path
   */
  private getType(path: string): string {
    const fileExtension = `.${path.split('.').pop()}`;
    return this.language.extensionMap[fileExtension] || '';
  }

  private filterData = (data: string, regexes: Regexes): LineInfo => {
    const lines = data.split(/\n/);
    let commentLength = 0;
    let codeLength = lines.length;
    const total = codeLength;

    let inMultiLineComment = false;
    lines.forEach((line) => {

      let lineType = 'code';
      line = line.trim();

      if (inMultiLineComment) {

        let noCode = true;
        if (regexes.multiLineCommentClose.test(line)) {
          // line contains the end of a multi-line comment
          inMultiLineComment = false;
          if (!regexes.multiLineCommentCloseEnd.test(line)) {
            // the multiline comment does not end this line.
            // there is real code on it.
            noCode = false;
          }
        }

        if (noCode) {
          lineType = 'comm';
          commentLength += 1;
          codeLength -= 1;
        }

      } else if (line) {

        // non-empty line
        if (regexes.multiLineCommentOpen.test(line)) {
          // line contains the start of a multi-line comment
          // might contain some real code, but we'll let that slide

          if (!regexes.multiLineCommentOpenAndClose.test(line)) {
            // comment is not also closed on this line
            inMultiLineComment = true;
          }

          if (regexes.multiLineCommentOpenStart.test(line)) {
            // The comment starts the line. There is no other code on this line
            commentLength += 1;
            codeLength -= 1;
            lineType = 'comm';
          }

        } else if (regexes.singleLineComment.test(line)) {
          // line contains only a single line comment
          commentLength += 1;
          codeLength -= 1;
          lineType = 'comm';
        }

      } else {
        // empty line
        codeLength -= 1;
        lineType = 'empt';
      }

      if (this.debug) {
        console.log(lineType, line)
      }
    });

    return {
      ...DefaultLine,
      total,
      code: codeLength,
      comment: commentLength,
    };
  };

  /**
   * Get file info when LocFile init
   */
  public async getFileInfo(data?: string): Promise<FileInfo> {
    if (!(await fs.pathExists(this.rawPath))) {
      throw new Error(`Error: file ${this.rawPath} does not exist.`);
    }

    let newData = data;
    const info: FileInfo = Object.assign({}, DefaultFileInfo);
    const name = this.path.split(Path.sep).pop() || '';
    try {
      const stat = await fs.stat(this.path);
      if (!stat.isFile()) {
        return info;
      }
      newData = data || await fs.readFile(this.path, 'utf-8');
      info.name = name;
      info.size = (stat && stat.size) || 0;
      info.languages = this.getType(this.path);
      if (!info.languages) {
        return info;
      }
      if (newData) {
        const regexes = this.language.getRegexes(info.languages);
        info.lines = this.filterData(newData, regexes);
      }
    } catch (err) {
      throw new Error('read file failed.');
    }
    return info;
  }

  public getFileInfoByContent(name: string, data: string): FileInfo {
    const info: FileInfo = Object.assign({}, DefaultFileInfo);
    info.name = name;
    info.languages = this.getType(name);
    info.lines = this.filterData(data, this.language.getRegexes(info.languages));
    return info;
  }
}
