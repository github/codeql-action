import { ActionsEnv } from "./actions-util";
import { Env } from "./environment";
import { FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";

/** Describes different state features that an Action may have. */
export interface FeatureState {
  Logger: {
    /** The logger that is in use. */
    logger: Logger;
  };
  Env: {
    /** Information about environment variables. */
    env: Env;
  };
  Actions: {
    /** Access to Actions-related functionality. */
    actions: ActionsEnv;
  };
  FeatureFlags: {
    /** Information about enabled feature flags. */
    features: FeatureEnablement;
  };
}

/** Identifies a type of state an Action may have. */
export type StateFeature = keyof FeatureState;

/** Constructs the union of all state types identifies by `Fs`. */
export type FieldsOf<Fs extends readonly StateFeature[]> = Fs extends [
  infer Head extends StateFeature,
]
  ? FeatureState[Head]
  : Fs extends [
        infer Head extends StateFeature,
        ...infer Tail extends StateFeature[],
      ]
    ? FeatureState[Head] & FieldsOf<Tail>
    : never;

/** Describes the state of an Action that has access to the state corresponding to `Fs`. */
export type ActionState<Fs extends readonly StateFeature[]> = FieldsOf<Fs>;
