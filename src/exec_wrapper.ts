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

  let returnCode: number;
  try {
    returnCode = await exec.exec(
      commandLine,
      args,
      {
        listeners: listeners,
        ...options
      });
  } catch (e) {
    returnCode = 1;
  }
  if (returnCode === 0) {
    throw new Error('The exit code was ' + returnCode + '?!');
  }

  const regex = new RegExp("(No source code was seen during the build\\.|No JavaScript or TypeScript code found\\.)");

  if (regex.test(stderr) || regex.test(stdout) ) {
    throw new Error(`No source code was found. This can occur if the specified build commands failed to compile or process any code.
    - Confirm that there is some source code for the specified language in the project.
    - For codebases written in Go, JavaScript, TypeScript, and Python, do not specify
      an explicit --command.
    - For other languages, the --command must specify a "clean" build which compiles
    https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/configuring-code-scanning`);
  }

  return returnCode;
}
