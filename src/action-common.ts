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
  /** The platform the Action is running on. */
  platform: NodeJS.Platform;
  /** The architecture of the host. */
  arch: NodeJS.Architecture;
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

/**
 * The `Env` feature implies the availability of the `ReadOnlyEnv` feature.
 *
 * If `T` is `Env`, this returns `Env | ReadOnlyEnv`.
 * Otherwise, it is the identity and returns T.
 */
type ImpliedFeatures<T extends StateFeature> = T extends "Env"
  ? "Env" | "ReadOnlyEnv"
  : T;

/**
 * Given an object type `Obj`, this tries to lookup a corresponding `StateFeature`
 * to which the object type belongs in `FeatureState`. Resolves to `never` if there
 * is no match.
 */
type FeatureNameFor<Obj extends object> = {
  [K in StateFeature]: [Obj] extends [FeatureState[K]]
    ? [FeatureState[K]] extends [Obj]
      ? K
      : never
    : never;
}[StateFeature];

/** Constructs the intersection of all state types identifies by `Fs`. */
export type FieldsOf<Fs extends readonly StateFeature[]> = Fs extends []
  ? Record<never, never>
  : Fs extends [
        infer Head extends StateFeature,
        ...infer Tail extends readonly StateFeature[],
      ]
    ? FeatureState[Head] & FieldsOf<Tail>
    : never;

/**
 * Symbol used for a field in `ActionState` that carries the type array of state features.
 * This is a Symbol so that it doesn't clash with any property names we might want to have.
 */
const stateFeatures = Symbol();

/** Describes the state of an Action that has access to the state corresponding to `Fs`. */
export type ActionState<Fs extends readonly StateFeature[]> = FieldsOf<Fs> & {
  /**
   * When given a chance, TypeScript will simplify an `ActionState<Fs>` type as much as possible,
   * which results in a concrete object type that doesn't mention `Fs`.
   *
   * That causes problems for functions which accept `ActionState<Fs>` values, but need to know the
   * feature keys `Fs`. This property here explicitly captures `Fs` in the concrete object type
   * that results from simplifying `ActionState<Fs>`.
   *
   * This is a function rather than a field, because we want to be able to provide values of type
   * `ActionState<Fs>` to functions expecting `ActionState<As>` where `As` is a subset of `Fs`.
   *
   * Since function types are contravariant in the types of their parameters, using a function
   * type here allows that to happen.
   *
   * Because the field is optional, we don't have to explicitly provide a value
   * for it anywhere while the type is still inferred.
   *
   * `Fs[number]` returns the union of all features in `Fs`. We wrap it in `ImpliedFeatures`
   * so that `Env` is expanded into `Env | ReadOnlyEnv`, allowing functions that expect the
   * `ReadOnlyEnv` feature to be provided with an `ActionState` that has the `Env` feature
   * without requiring this to be made explicit.
   */
  readonly [stateFeatures]?: (ts: ImpliedFeatures<Fs[number]>) => void;
};

/** Extends `state` with an `extra` feature. */
export function extendActionState<
  // In first position, so that it can be explicitly provided if `FeatureNameFor`
  // should not work on `extra`.
  F extends StateFeature,
  Fs extends readonly StateFeature[],
  E extends FeatureState[F],
>(
  state: ActionState<Fs>,
  extra: E,
): ActionState<[...Fs, FeatureNameFor<E> & F]> {
  return { ...state, ...extra } as unknown as ActionState<
    [...Fs, FeatureNameFor<E> & F]
  >;
}

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
      platform: process.platform,
      arch: process.arch,
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
