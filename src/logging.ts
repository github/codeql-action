import * as core from "@actions/core";

/** Types that all of our logging functions accept. */
export type Loggable = string | string[];

/** Some logging functions also accept errors directly. */
export type LoggableError = Loggable | Error;

export interface Logger {
  /**
   * Logs {@link message} at debug-level.
   * In Actions, this will only be output if workflow debugging is enabled.
   *
   * @param message
   *    A string or an array of strings. If an array of strings is provided, they are joined using
   *    space as the delimiter and printed as a single line.
   */
  debug: (message: Loggable) => void;
  /**
   * Logs {@link message} at info-level.
   * In Actions, this will always be output.
   *
   * @param message
   *    A string or an array of strings. If an array of strings is provided, they are joined using
   *    space as the delimiter and printed as a single line.
   */
  info: (message: Loggable) => void;
  /**
   * Logs {@link message} at warning-level.
   * In Actions, this will always be output and highlighted as a warning. It will additionally
   * result in a warning-level workflow annotation.
   *
   * @param message
   *    A string or an array of strings. If an array of strings is provided, they are joined using
   *    space as the delimiter and printed as a single line.
   */
  warning: (message: LoggableError) => void;
  /**
   * Logs {@link message} at error-level.
   * In Actions, this will always be output and highlighted as an error. It will additionally
   * result in an error-level workflow annotation.
   *
   * @param message
   *    A string or an array of strings. If an array of strings is provided, they are joined using
   *    space as the delimiter and printed as a single line.
   */
  error: (message: LoggableError) => void;
  /**
   * Gets a value indicating whether debugging is enabled.
   */
  isDebug: () => boolean;

  startGroup: (name: string) => void;
  endGroup: () => void;
}

/** If `message` is an array of strings, the array is `join`-ed into one string separated by spaces. */
export const joinMessageStrings = <T>(
  message: string[] | string | T,
): string | T => {
  if (Array.isArray(message)) {
    return message.join(" ");
  } else {
    return message;
  }
};

/**
 * Wraps a logging function so that `joinMessageStrings` is applied to the input before
 * calling the wrapped logging function.
 */
const autoJoinMessageStrings = <T>(fn: (msg: string | T) => void) => {
  return (message: string[] | string | T) => {
    return fn(joinMessageStrings(message));
  };
};

export function getActionsLogger(): Logger {
  return {
    debug: autoJoinMessageStrings(core.debug),
    info: autoJoinMessageStrings(core.info),
    warning: autoJoinMessageStrings(core.warning),
    error: autoJoinMessageStrings(core.error),
    isDebug: core.isDebug,
    startGroup: core.startGroup,
    endGroup: core.endGroup,
  };
}

export function withGroup<T>(groupName: string, f: () => T): T {
  core.startGroup(groupName);
  try {
    return f();
  } finally {
    core.endGroup();
  }
}

export async function withGroupAsync<T>(
  groupName: string,
  f: () => Promise<T>,
): Promise<T> {
  core.startGroup(groupName);
  try {
    return await f();
  } finally {
    core.endGroup();
  }
}

/** Format a duration for use in logs. */
export function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60 * 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(durationMs / (60 * 1000));
  const seconds = Math.floor((durationMs % (60 * 1000)) / 1000);
  return `${minutes}m${seconds}s`;
}
