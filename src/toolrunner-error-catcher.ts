import * as im from "@actions/exec/lib/interfaces";
import * as toolrunner from "@actions/exec/lib/toolrunner";
import * as safeWhich from "@chrisgavin/safe-which";

import { ErrorMatcher } from "./error-matcher";

export interface ReturnState {
  exitCode: number;
  stdout: string;
}

/**
 * Wrapper for toolrunner.Toolrunner which checks for specific return code and/or regex matches in console output.
 * Output will be streamed to the live console as well as captured for subsequent processing.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     matchers           defines specific codes and/or regexes that should lead to return of a custom error
 * @param     options            optional exec options.  See ExecOptions
 * @returns   ReturnState        exit code and stdout output, if applicable
 */
export async function toolrunnerErrorCatcher(
  commandLine: string,
  args?: string[],
  matchers?: ErrorMatcher[],
  options?: im.ExecOptions
): Promise<ReturnState> {
  let stdout = "";
  let stderr = "";

  const listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString();
      if (options?.listeners?.stdout !== undefined) {
        options.listeners.stdout(data);
      }
    },
    stderr: (data: Buffer) => {
      stderr += data.toString();
      if (options?.listeners?.stderr !== undefined) {
        options.listeners.stderr(data);
      }
    },
  };

  // we capture the original return code or error so that if no match is found we can duplicate the behavior
  let exitCode: number;
  try {
    exitCode = await new toolrunner.ToolRunner(
      await safeWhich.safeWhich(commandLine),
      args,
      {
        ...options, // we want to override the original options, so include them first
        listeners,
        ignoreReturnCode: true, // so we can check for specific codes using the matchers
      }
    ).exec();

    // if there is a zero return code then we do not apply the matchers
    if (exitCode === 0) return { exitCode, stdout };

    if (matchers) {
      for (const matcher of matchers) {
        if (
          matcher.exitCode === exitCode ||
          matcher.outputRegex?.test(stderr) ||
          matcher.outputRegex?.test(stdout)
        ) {
          throw new Error(matcher.message);
        }
      }
    }

    // only if we were instructed to ignore the return code do we ever return it non-zero
    if (options?.ignoreReturnCode) {
      return { exitCode, stdout };
    } else {
      throw new Error(
        `The process '${commandLine}' failed with exit code ${exitCode}`
      );
    }
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    throw error;
  }
}
