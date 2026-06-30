import { Env } from "./environment";
import { FeatureEnablement } from "./feature-flags";
import { Logger } from "./logging";

export interface ActionState {
  /** The logger that is in use. */
  logger: Logger;

  /** Information about environment variables. */
  env: Env;

  /** Information about enabled feature flags. */
  features: FeatureEnablement;
}
