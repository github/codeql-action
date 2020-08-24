import * as exec from '@actions/exec';
import * as im from '@actions/exec/lib/interfaces';

export async function exec_wrapper(commandLine: string, args?: string[], options?: im.ExecOptions): Promise<number> {

  const originalListener = options?.listeners;

  let stdout = '';
  let stderr = '';

  let listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString();
      if (originalListener?.stdout !== undefined) {
        originalListener.stdout(data);
      } else {
        // if no stdout listener was originally defined then match behaviour of exec.exec
        process.stdout.write(data);
      }

    },
    stderr: (data: Buffer) => {
      stderr += data.toString();
      if (originalListener?.stderr !== undefined) {
        originalListener.stderr(data);
      } else {
        // if no stderr listener was originally defined then match behaviour of exec.exec
        process.stderr.write(data);
      }
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
