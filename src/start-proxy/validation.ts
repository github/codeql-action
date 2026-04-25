import * as core from "@actions/core";

import * as json from "../json";
import { isDefined } from "../util";

import type { AuthConfig, UsernamePassword } from "./types";
import * as types from "./types";

/** Constructs a new object from `obj` with only keys that exist in `schema`. */
export function cloneCredential<
  T extends json.FromSchema<S>,
  S extends json.Schema,
>(schema: S, obj: T): T {
  const result = {};

  for (const key of Object.keys(schema)) {
    // Skip keys that don't exist or don't have a value.
    if (!isDefined(obj[key])) {
      continue;
    }
    result[key] = obj[key];
  }

  return result as T;
}

/** Extracts an `AuthConfig` value from `config`. */
export function getAuthConfig(
  config: json.UnvalidatedObject<AuthConfig>,
): AuthConfig {
  // Start by checking for the OIDC configurations, since they have required properties
  // which we can use to identify them.
  for (const oidcSchema of types.oidcSchemas) {
    if (json.validateSchema(oidcSchema.schema, config)) {
      return cloneCredential(oidcSchema.schema, config);
    }
  }

  // Otherwise, try the basic configuration types.
  if (types.isToken(config)) {
    // There are three scenarios for non-OIDC authentication based on the registry type:
    //
    // 1. `username`+`token`
    // 2. A `token` that combines the username and actual token, separated by ':'.
    // 3. `username`+`password`
    //
    // In all three cases, all fields are optional. If the `token` field is present,
    // we accept the configuration as a `Token` typed configuration, with the `token`
    // value and an optional `username`. Otherwise, we accept the configuration
    // typed as `UsernamePassword` (in the `else` clause below) with optional
    // username and password. I.e. a private registry type that uses 1. or 2.,
    // but has no `token` configured, will get accepted as `UsernamePassword` here.

    if (isDefined(config.token)) {
      // Mask token to reduce chance of accidental leakage in logs, if we have one.
      core.setSecret(config.token);
    }

    return cloneCredential(types.tokenSchema, config);
  } else {
    let username: string | undefined = undefined;
    let password: string | undefined = undefined;

    // Both "username" and "password" are optional. If we have reached this point, we need
    // to validate which of them are present and that they have the correct type if so.
    if ("password" in config && json.isString(config.password)) {
      // Mask password to reduce chance of accidental leakage in logs, if we have one.
      core.setSecret(config.password);
      password = config.password;
    }
    if ("username" in config && json.isString(config.username)) {
      username = config.username;
    }

    // Return the `UsernamePassword` object. Both username and password may be undefined.
    return {
      username,
      password,
    } satisfies UsernamePassword;
  }
}
