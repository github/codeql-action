import * as core from "@actions/core";

import * as json from "../json";
import { isDefined } from "../util";

import type {
  AuthConfig,
  AWSConfig,
  AzureConfig,
  JFrogConfig,
  Token,
  UsernamePassword,
} from "./types";
import * as types from "./types";

/** Extracts an `AuthConfig` value from `config`. */
export function getAuthConfig(
  config: json.UnvalidatedObject<AuthConfig>,
): AuthConfig {
  // Start by checking for the OIDC configurations, since they have required properties
  // which we can use to identify them.
  if (types.isAzureConfig(config)) {
    return {
      "tenant-id": config["tenant-id"],
      "client-id": config["client-id"],
    } satisfies AzureConfig;
  } else if (types.isAWSConfig(config)) {
    return {
      "aws-region": config["aws-region"],
      "account-id": config["account-id"],
      "role-name": config["role-name"],
      domain: config.domain,
      "domain-owner": config["domain-owner"],
      audience: config.audience,
    } satisfies AWSConfig;
  } else if (types.isJFrogConfig(config)) {
    return {
      "jfrog-oidc-provider-name": config["jfrog-oidc-provider-name"],
      "identity-mapping-name": config["identity-mapping-name"],
      audience: config.audience,
    } satisfies JFrogConfig;
  } else if (types.isToken(config)) {
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

    return { username: config.username, token: config.token } satisfies Token;
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
