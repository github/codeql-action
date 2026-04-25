import type { UnvalidatedObject } from "../json";
import * as json from "../json";
import { isDefined } from "../util";

/**
 * After parsing configurations from JSON, we don't know whether all the keys we expect are
 * present or not. This type is used to represent such values, which we expect to be
 * `Credential` values, but haven't validated yet.
 */
export type RawCredential = UnvalidatedObject<Credential>;

/** A schema for credential objects with a username. */
export const usernameSchema = {
  /** The username needed to authenticate to the package registry, if any. */
  username: json.optional(json.string),
} as const satisfies json.Schema;

/** Usernames may be present for both authentication with tokens or passwords. */
export type Username = json.FromSchema<typeof usernameSchema>;

/** Decides whether `config` has a username. */
export function hasUsername(
  config: UnvalidatedObject<unknown>,
): config is Username {
  return "username" in config;
}

/** A schema for credential objects with a username and password. */
export const usernamePasswordSchema = {
  /** The password needed to authenticate to the package registry, if any. */
  password: json.optional(json.string),
  ...usernameSchema,
} as const satisfies json.Schema;

/**
 * Fields expected for authentication based on a username and password.
 * Both username and password are optional.
 */
export type UsernamePassword = json.FromSchema<typeof usernamePasswordSchema>;

/** Decides whether `config` is based on a username and password. */
export function isUsernamePassword(
  config: AuthConfig,
): config is UsernamePassword {
  return json.validateSchema(usernamePasswordSchema, config);
}

/** A schema for credential objects for token-based authentication. */
export const tokenSchema = {
  /** The token needed to authenticate to the package registry, if any. */
  token: json.optional(json.string),
  ...usernameSchema,
} as const satisfies json.Schema;

/**
 * Fields expected for token-based authentication.
 * Both username and token are optional.
 */
export type Token = json.FromSchema<typeof tokenSchema>;

/** Decides whether `config` is token-based. */
export function isToken(
  config: UnvalidatedObject<AuthConfig>,
): config is Token {
  return "token" in config && json.validateSchema(tokenSchema, config);
}

/** A schema for Azure OIDC configurations. */
export const azureConfigSchema = {
  "tenant-id": json.string,
  "client-id": json.string,
} as const satisfies json.Schema;

/** Configuration for Azure OIDC. */
export type AzureConfig = json.FromSchema<typeof azureConfigSchema>;

/** Decides whether `config` is an Azure OIDC configuration. */
export function isAzureConfig(
  config: UnvalidatedObject<AuthConfig>,
): config is AzureConfig {
  return json.validateSchema(azureConfigSchema, config);
}

/** A schema for AWS OIDC configurations. */
export const awsConfigSchema = {
  "aws-region": json.string,
  "account-id": json.string,
  "role-name": json.string,
  domain: json.string,
  "domain-owner": json.string,
  audience: json.optional(json.string),
} as const satisfies json.Schema;

/** Configuration for AWS OIDC. */
export type AWSConfig = json.FromSchema<typeof awsConfigSchema>;

/** Decides whether `config` is an AWS OIDC configuration. */
export function isAWSConfig(
  config: UnvalidatedObject<AuthConfig>,
): config is AWSConfig {
  return json.validateSchema(awsConfigSchema, config);
}

/** A schema for JFrog OIDC configurations. */
export const jfrogConfigSchema = {
  "jfrog-oidc-provider-name": json.string,
  audience: json.optional(json.string),
  "identity-mapping-name": json.optional(json.string),
} as const satisfies json.Schema;

/** Configuration for JFrog OIDC. */
export type JFrogConfig = json.FromSchema<typeof jfrogConfigSchema>;

/** Decides whether `config` is a JFrog OIDC configuration. */
export function isJFrogConfig(
  config: UnvalidatedObject<AuthConfig>,
): config is JFrogConfig {
  return json.validateSchema(jfrogConfigSchema, config);
}

/** A schema for Cloudsmith OIDC configurations. */
export const cloudsmithConfigSchema = {
  namespace: json.string,
  "service-slug": json.string,
  "api-host": json.string,
} as const satisfies json.Schema;

/** Configuration for Cloudsmith OIDC. */
export type CloudsmithConfig = json.FromSchema<typeof cloudsmithConfigSchema>;

/** Decides whether `config` is a Cloudsmith OIDC configuration. */
export function isCloudsmithConfig(
  config: UnvalidatedObject<AuthConfig>,
): config is CloudsmithConfig {
  return json.validateSchema(cloudsmithConfigSchema, config);
}

/** An array of all OIDC configuration schemas along with output-friendly names. */
export const oidcSchemas = [
  { schema: azureConfigSchema, name: "Azure" },
  { schema: awsConfigSchema, name: "AWS" },
  { schema: jfrogConfigSchema, name: "JFrog" },
  { schema: cloudsmithConfigSchema, name: "Cloudsmith" },
];

/** Represents all supported OIDC configurations. */
export type OIDC = AzureConfig | AWSConfig | JFrogConfig | CloudsmithConfig;

/** All authentication-related fields. */
export type AuthConfig = UsernamePassword | Token | OIDC;

/**
 * A package registry configuration includes identifying information as well as
 * authentication credentials.
 */
export type Credential = AuthConfig & Registry;

/**
 * Pretty-prints a `Credential` value to a string, but hides the actual password or token values.
 *
 * @param credential The credential to convert to a string.
 */
export function credentialToStr(credential: Credential): string {
  let result: string = `Type: ${credential.type};`;

  const appendIfDefined = (name: string, val: string | undefined | null) => {
    if (isDefined(val)) {
      result += ` ${name}: ${val};`;
    }
  };

  appendIfDefined("Url", credential.url);
  appendIfDefined("Host", credential.host);

  if (hasUsername(credential)) {
    appendIfDefined("Username", credential.username);
  }

  if ("password" in credential) {
    appendIfDefined(
      "Password",
      isDefined(credential.password) ? "***" : undefined,
    );
  }
  if (isToken(credential)) {
    appendIfDefined("Token", isDefined(credential.token) ? "***" : undefined);
  }

  if (isAzureConfig(credential)) {
    appendIfDefined("Tenant", credential["tenant-id"]);
    appendIfDefined("Client", credential["client-id"]);
  } else if (isAWSConfig(credential)) {
    appendIfDefined("AWS Region", credential["aws-region"]);
    appendIfDefined("AWS Account", credential["account-id"]);
    appendIfDefined("AWS Role", credential["role-name"]);
    appendIfDefined("AWS Domain", credential.domain);
    appendIfDefined("AWS Domain Owner", credential["domain-owner"]);
    appendIfDefined("AWS Audience", credential.audience);
  } else if (isJFrogConfig(credential)) {
    appendIfDefined("JFrog Provider", credential["jfrog-oidc-provider-name"]);
    appendIfDefined(
      "JFrog Identity Mapping",
      credential["identity-mapping-name"],
    );
    appendIfDefined("JFrog Audience", credential.audience);
  } else if (isCloudsmithConfig(credential)) {
    appendIfDefined("Cloudsmith Namespace", credential.namespace);
    appendIfDefined("Cloudsmith Service Slug", credential["service-slug"]);
    appendIfDefined("Cloudsmith API Host", credential["api-host"]);
  }

  return result;
}

/** A package registry is identified by its type and address. */
export type Registry = {
  /** The type of the package registry. */
  type: string;
} & Address;

// If a registry has an `url`, then that takes precedence over the `host` which may or may
// not be defined.
interface HasUrl {
  url: string;
  host?: string;
}

// If a registry does not have an `url`, then it must have a `host`.
interface WithoutUrl {
  url: undefined;
  host: string;
}

/**
 * A valid `Registry` value must either have a `url` or a `host` value. If it has a `url` value,
 * then that takes precedence over the `host` value. If there is no `url` value, then it must
 * have a `host` value.
 */
export type Address = HasUrl | WithoutUrl;

/** Gets the address as a string. This will either be the `url` if present, or the `host` if not. */
export function getAddressString(address: Address): string {
  if (address.url === undefined) {
    return address.host;
  } else {
    return address.url;
  }
}

export interface ProxyInfo {
  host: string;
  port: number;
  cert: string;
  registries: Registry[];
}

export type CertificateAuthority = {
  cert: string;
  key: string;
};

export type BasicAuthCredentials = {
  username: string;
  password: string;
};

/**
 * Represents configurations for the authentication proxy.
 */
export type ProxyConfig = {
  /** The validated configurations for the proxy. */
  all_credentials: Credential[];
  ca: CertificateAuthority;
  proxy_auth?: BasicAuthCredentials;
};
