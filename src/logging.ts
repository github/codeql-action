import * as core from '@actions/core';

export interface Logger {
  debug: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;

  startGroup: (name: string) => void;
  endGroup: () => void;
}

export function getActionsLogger(): Logger {
  return core;
}

export function getCLILogger(): Logger {
  return {
    debug: console.debug,
    info: console.info,
    warning: console.warn,
    error: console.error,
    startGroup: () => undefined,
    endGroup: () => undefined,
  };
}
