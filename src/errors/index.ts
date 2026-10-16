import * as json from "../json";

/**
 * If {@link error} is not already an instance of {@link Error}, then this function constructs
 * an {@link Error} with a string representation of {@link error} as the message.
 */
export function wrapError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Returns an appropriate message for the error.
 *
 * If the error is an {@link Error} instance, this returns the error message without
 * an `Error: ` prefix.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Decides whether `e` is a disk-related error outside of our control
 * that should be classified as a `ConfigurationError`.
 *
 * @param e The error to check.
 * @returns True if the error should be treated as a `ConfigurationError` or false if not.
 */
export function isDiskConfigurationError(e: unknown): boolean {
  if (!(e instanceof Error)) {
    return false;
  }

  return (
    // out of disk space
    e.message.includes("ENOSPC") ||
    // access denied
    e.message.includes("EACCES")
  );
}

/**
 * An Error class that indicates an error that occurred due to
 * a misconfiguration of the action or the CodeQL CLI.
 */
export class ConfigurationError extends Error {}

/** Minimal representation of errors resulting from HTTP requests. */
export class HTTPError extends Error {
  public status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Tries to convert {@link arg} to a {@link HTTPError}, but returns `undefined` if
 * {@link arg} is not like a {@link HTTPError}.
 */
export function asHTTPError(arg: any): HTTPError | undefined {
  if (!json.isObject<any>(arg) || !json.isString(arg.message)) {
    return undefined;
  }
  if (Number.isInteger(arg.status)) {
    return new HTTPError(arg.message, arg.status as number);
  }
  // See https://github.com/actions/toolkit/blob/acb230b99a46ed33a3f04a758cd68b47b9a82908/packages/tool-cache/src/tool-cache.ts#L19
  if (Number.isInteger(arg.httpStatusCode)) {
    return new HTTPError(arg.message, arg.httpStatusCode as number);
  }
  return undefined;
}
