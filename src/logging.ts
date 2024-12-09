import * as core from "@actions/core";

export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string | Error) => void;
  error: (message: string | Error) => void;

  isDebug: () => boolean;

  startGroup: (name: string) => void;
  endGroup: () => void;
}

export function getActionsLogger(): Logger {
  return core;
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
