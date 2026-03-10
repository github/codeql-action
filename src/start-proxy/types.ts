import { isDefined } from "../util";

/**
 * After parsing configurations from JSON, we don't know whether all the keys we expect are
 * present or not. This type is used to represent such values, which we expect to be
 * `Credential` values, but haven't validated yet.
 */
export type RawCredential = Partial<Credential>;

/** Usernames may be present for both authentication with tokens or passwords. */
export type Username = {
  /** The username needed to authenticate to the package registry, if any. */
  username?: string;
};

/** Decides whether `config` has a username. */
export function hasUsername(config: Partial<AuthConfig>): config is Username {
  return "username" in config;
}

/**
 * Fields expected for authentication based on a username and password.
 * Both username and password are optional.
 */
export type UsernamePassword = {
  /** The password needed to authenticate to the package registry, if any. */
  password?: string;
} & Username;

/** Decides whether `config` is based on a username and password. */
export function isUsernamePassword(
  config: AuthConfig,
): config is UsernamePassword {
  return hasUsername(config) && "password" in config;
}

/**
 * Fields expected for token-based authentication.
 * Both username and token are optional.
 */
export type Token = {
  /** The token needed to authenticate to the package registry, if any. */
  token?: string;
} & Username;

/** Decides whether `config` is token-based. */
export function isToken(config: Partial<AuthConfig>): config is Token {
  return "token" in config;
}

/** Configuration for Azure OIDC. */
export type AzureConfig = { tenant_id: string; client_id: string };

/** Decides whether `config` is an Azure OIDC configuration. */
export function isAzureConfig(
  config: Partial<AuthConfig>,
): config is AzureConfig {
  return (
    "tenant_id" in config &&
    "client_id" in config &&
    isDefined(config.tenant_id) &&
    isDefined(config.client_id)
  );
}

/** Configuration for AWS OIDC. */
export type AWSConfig = {
  aws_region: string;
  account_id: string;
  role_name: string;
  domain: string;
  domain_owner: string;
  audience?: string;
};

/** Decides whether `config` is an AWS OIDC configuration. */
export function isAWSConfig(config: Partial<AuthConfig>): config is AWSConfig {
  // All of these properties are required.
  const requiredProperties = [
    "aws_region",
    "account_id",
    "role_name",
    "domain",
    "domain_owner",
  ];

  for (const property of requiredProperties) {
    if (!(property in config) || !isDefined(config[property])) {
      return false;
    }
  }
  return true;
}

/** Configuration for JFrog OIDC. */
export type JFrogConfig = {
  jfrog_oidc_provider_name: string;
  audience?: string;
  identity_mapping_name?: string;
};

/** Decides whether `config` is a JFrog OIDC configuration. */
export function isJFrogConfig(
  config: Partial<AuthConfig>,
): config is JFrogConfig {
  return (
    "jfrog_oidc_provider_name" in config &&
    isDefined(config.jfrog_oidc_provider_name)
  );
}

/** Represents all supported OIDC configurations. */
export type OIDC = AzureConfig | AWSConfig | JFrogConfig;

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

  const appendIfDefined = (name: string, val: string | undefined) => {
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
    appendIfDefined("Password", credential.password ? "***" : undefined);
  }
  if (isToken(credential)) {
    appendIfDefined("Token", credential.token ? "***" : undefined);
  }

  if (isAzureConfig(credential)) {
    appendIfDefined("Tenant", credential.tenant_id);
    appendIfDefined("Client", credential.client_id);
  } else if (isAWSConfig(credential)) {
    appendIfDefined("AWS Region", credential.aws_region);
    appendIfDefined("AWS Account", credential.account_id);
    appendIfDefined("AWS Role", credential.role_name);
    appendIfDefined("AWS Domain", credential.domain);
    appendIfDefined("AWS Domain Owner", credential.domain_owner);
    appendIfDefined("AWS Audience", credential.audience);
  } else if (isJFrogConfig(credential)) {
    appendIfDefined("JFrog Provider", credential.jfrog_oidc_provider_name);
    appendIfDefined("JFrog Identity Mapping", credential.identity_mapping_name);
    appendIfDefined("JFrog Audience", credential.audience);
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
