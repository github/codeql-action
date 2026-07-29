import * as core from "@actions/core";

import { ActionsEnv, getActionsEnv } from "./actions-util";
import type { ApiClient } from "./api-client";
import { Env, ReadOnlyEnv } from "./environment";
import type { FeatureEnablement } from "./feature-flags";
import { getActionsLogger, Logger } from "./logging";
import {
  ActionName,
  getDisplayActionName,
  getJobUUID,
  sendUnhandledErrorStatusReport,
} from "./status-report";
import { getEnv, getErrorMessage, wrapError } from "./util";

/** Base state that is available to an Action on startup. */
export interface BaseState {
  /** The name of the Action. */
  name: ActionName;
  /** When the Action was started. */
  startedAt: Date;
}

/** Describes different state features that an Action may have. */
export interface FeatureState {
  Base: BaseState;
  Logger: {
    /** The logger that is in use. */
    logger: Logger;
  };
  Env: {
    /** Information about environment variables. */
    env: Env;
  };
  ReadOnlyEnv: {
    env: ReadOnlyEnv;
  };
  Actions: {
    /** Access to Actions-related functionality. */
    actions: ActionsEnv;
  };
  Api: {
    /** A GitHub API client. */
    apiClient: ApiClient;
  };
  FeatureFlags: {
    /** Information about enabled feature flags. */
    features: FeatureEnablement;
  };
}

/** Identifies a type of state an Action may have. */
export type StateFeature = keyof FeatureState;

/** Constructs the intersection of all state types identifies by `Fs`. */
export type FieldsOf<Fs extends readonly StateFeature[]> = Fs extends []
  ? Record<never, never>
  : Fs extends [
        infer Head extends StateFeature,
        ...infer Tail extends readonly StateFeature[],
      ]
    ? FeatureState[Head] & FieldsOf<Tail>
    : never;

/** Describes the state of an Action that has access to the state corresponding to `Fs`. */
export type ActionState<Fs extends readonly StateFeature[]> = FieldsOf<Fs>;

/** The type of an Action's main entry point. This is a function that is provided
 * with a basic `ActionState` object with features that are always available.
 * Each Action can then augment the `state` further if additional features are required.
 */
export type ActionMain = (
  state: ActionState<["Base", "Logger", "Env", "Actions"]>,
) => Promise<void>;

/** A specification for a CodeQL Action step. */
export interface Action {
  /** The name of the Action. */
  name: ActionName;
  /** The entry point for the Action. */
  run: ActionMain;
  /**
   * An optional function that transforms a caught error into a message suitable for
   * inclusion in a status report. This is primarily intended for the `start-proxy`
   * action to replace the thrown `Error`'s message with a safe one.
   */
  transformTelemetryError?: (error: Error) => string;
}

/** A generic entry point that sets up the basic environment for the `action` and runs it. */
export async function runInActions(action: Action) {
  const startedAt = new Date();
  const logger = getActionsLogger();
  const env = getEnv();
  const actionsEnv = getActionsEnv();

  try {
    const actionState = {
      name: action.name,
      startedAt,
      logger,
      env,
      actions: actionsEnv,
    };

    // Create a unique identifier for this run.
    getJobUUID(actionState);

    await action.run(actionState);
  } catch (error) {
    core.setFailed(
      `${getDisplayActionName(action.name)} action failed: ${getErrorMessage(error)}`,
    );

    const statusReportError =
      action.transformTelemetryError !== undefined
        ? action.transformTelemetryError(wrapError(error))
        : error;
    await sendUnhandledErrorStatusReport(
      action.name,
      startedAt,
      statusReportError,
      logger,
    );
  }
}
