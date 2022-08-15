import { ExecException, ChildProcess } from 'child_process'

declare function fastFolderSize(
  path: string,
  callback: (err: ExecException | null, bytes?: number) => void
): ChildProcess

export = fastFolderSize
