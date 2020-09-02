import * as exec from '@actions/exec';
import * as im from '@actions/exec/lib/interfaces';


/**
 * Wrapper for exec.exec which checks for specific return code and/or regex matches in console output.
 * Output will be streamed to the live console as well as captured for subsequent processing.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute (can include additional args). Must be correctly escaped.
 * @param     matchers           defines specific codes and/or regexes that should lead to return of a custom error
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     options            optional exec options.  See ExecOptions
 * @returns   Promise<number>    exit code
 */
export async function exec_wrapper(commandLine: string, args?: string[],
                                   matchers?: [[number, RegExp, string]],
                                   options?: im.ExecOptions): Promise<number> {

  let stdout = '';
  let stderr = '';

  // custom listeners to store stdout and stderr, while also replicating the behaviour of the passed listeners
  const originalListener = options?.listeners;
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

  // we capture the original return code and error so that (if no match is found) we can duplicate the behaviour
  let originalReturnValue: Error|number;
  try {
    originalReturnValue = await exec.exec(
      commandLine,
      args,
      {
        listeners: listeners,
        ...options
      });
  } catch (e) {
    originalReturnValue = e;
  }

  if (matchers) {
    for (const [customCode, regex, message] of matchers) {
      if (customCode === originalReturnValue || regex.test(stderr) || regex.test(stdout) ) {
        throw new Error(message);
      }
    }
  }

  if (typeof originalReturnValue === 'number') {
    return originalReturnValue;
  } else {
    throw originalReturnValue;
  }
}
