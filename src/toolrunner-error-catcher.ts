import * as im from "@actions/exec/lib/interfaces";
import * as toolrunnner from "@actions/exec/lib/toolrunner";
import * as safeWhich from "@chrisgavin/safe-which";

import { ErrorMatcher } from "./error-matcher";

/**
 * Wrapper for toolrunner.Toolrunner which checks for specific return code and/or regex matches in console output.
 * Output will be streamed to the live console as well as captured for subsequent processing.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     matchers           defines specific codes and/or regexes that should lead to return of a custom error
 * @param     options            optional exec options.  See ExecOptions
 * @returns   Promise<number>    exit code
 */
export async function toolrunnerErrorCatcher(
  commandLine: string,
  args?: string[],
  matchers?: ErrorMatcher[],
  options?: im.ExecOptions
): Promise<number> {
  let stdout = "";
  let stderr = "";

  const listeners = {
    stdout: (data: Buffer) => {
      stdout += data.toString();
      if (options?.listeners?.stdout !== undefined) {
        options.listeners.stdout(data);
      } else {
        // if no stdout listener was originally defined then we match default behavior of Toolrunner
        process.stdout.write(data);
      }
    },
    stderr: (data: Buffer) => {
      stderr += data.toString();
      if (options?.listeners?.stderr !== undefined) {
        options.listeners.stderr(data);
      } else {
        // if no stderr listener was originally defined then we match default behavior of Toolrunner
        process.stderr.write(data);
      }
    },
  };

  // we capture the original return code or error so that if no match is found we can duplicate the behavior
  let returnState: Error | number;
  try {
    returnState = await new toolrunnner.ToolRunner(
      await safeWhich.safeWhich(commandLine),
      args,
      {
        ...options, // we want to override the original options, so include them first
        listeners,
        ignoreReturnCode: true, // so we can check for specific codes using the matchers
      }
    ).exec();
  } catch (e) {
    returnState = e;
  }

  // if there is a zero return code then we do not apply the matchers
  if (returnState === 0) return returnState;

  if (matchers) {
    for (const matcher of matchers) {
      if (
        matcher.exitCode === returnState ||
        matcher.outputRegex?.test(stderr) ||
        matcher.outputRegex?.test(stdout)
      ) {
        throw new Error(matcher.message);
      }
    }
  }

  if (typeof returnState === "number") {
    // only if we were instructed to ignore the return code do we ever return it non-zero
    if (options?.ignoreReturnCode) {
      return returnState;
    } else {
      throw new Error(
        `The process '${commandLine}' failed with exit code ${returnState}`
      );
    }
  } else {
    throw returnState;
  }
}
