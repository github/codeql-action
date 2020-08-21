import * as exec from '@actions/exec';
import * as im from '@actions/exec/lib/interfaces';

export async function exec_wrapper(commandLine: string, args?: string[], options?: im.ExecOptions): Promise<number> {

  const originalListener = options?.listeners;

  let stdout = '';
  let stderr = '';

  let listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString();
      // NB change behaviour to only write to stdout/err if no listener passed
      process.stdout.write(data);
      originalListener?.stdout?.(data);
    },
    stderr: (data: Buffer) => {
      stderr += data.toString();
      process.stderr.write(data);
      originalListener?.stderr?.(data);
    }
  };

  const returnCode = await exec.exec(
    commandLine,
    args,
    {
      listeners: listeners,
      ...options
    });

  if (stderr === stdout ) {
    console.log('foo bar');
  }

  return returnCode;

}
