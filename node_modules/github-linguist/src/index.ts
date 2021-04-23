// @ts-ignore
import slash from 'slash2';
import fs from 'fs-extra';

import { LocDir, LocResult } from './directory';
import { LocFile } from './file';

export { LocDir, LocDirOptions } from './directory';
export { LocFile, LineInfo } from './file';

const loc = async (
  fileOrDir: string,
): Promise<LocResult> => {
  const stat = await fs.stat(slash(fileOrDir));
  if (stat.isFile()) {
    const locFile = new LocFile(slash(fileOrDir));
    const info = await locFile.getFileInfo();
    const filePath = locFile.path;
    return {
      info: info.lines,
      files: [filePath],
      languages: { [info.languages]: { ...info.lines, sum: 1 } },
    };
  }
  const locDir = new LocDir({ cwd: slash(fileOrDir) });
  return locDir.loadInfo();
};

export default loc;
