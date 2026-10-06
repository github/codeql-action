import * as core from "@actions/core";

/** Types that all of our logging functions accept. */
export type Loggable = string | string[];

/** Some logging functions also accept errors directly. */
export type LoggableError = Loggable | Error;

export interface Logger {
  debug: (message: Loggable) => void;
  info: (message: Loggable) => void;
  warning: (message: LoggableError) => void;
  error: (message: LoggableError) => void;

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

export function getRunnerLogger(debugMode: boolean): Logger {
  return {
    // eslint-disable-next-line no-console
    debug: debugMode ? console.debug : () => undefined,
    // eslint-disable-next-line no-console
    info: console.info,
    // eslint-disable-next-line no-console
    warning: console.warn,
    // eslint-disable-next-line no-console
    error: console.error,
    isDebug: () => debugMode,
    startGroup: () => undefined,
    endGroup: () => undefined,
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
