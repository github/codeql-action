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

/**
 * Fields expected for authentication based on a username and password.
 * Both username and password are optional.
 */
export type UsernamePassword = {
  /** The password needed to authenticate to the package registry, if any. */
  password?: string;
} & Username;

/**
 * Fields expected for token-based authentication.
 * Both username and token are optional.
 */
export type Token = {
  /** The token needed to authenticate to the package registry, if any. */
  token?: string;
} & Username;

/** Configuration for Azure OIDC. */
export type AzureConfig = { tenant_id: string; client_id: string };

/** Configuration for AWS OIDC. */
export type AWSConfig = {
  aws_region: string;
  account_id: string;
  role_name: string;
  domain: string;
  domain_owner: string;
  audience?: string;
};

/** Configuration for JFrog OIDC. */
export type JFrogConfig = {
  jfrog_oidc_provider_name: string;
  audience?: string;
  identity_mapping_name?: string;
};

/** Represents all supported OIDC configurations. */
export type OIDC = AzureConfig | AWSConfig | JFrogConfig;

/** All authentication-related fields. */
export type AuthConfig = UsernamePassword & Token & OIDC;

/**
 * A package registry configuration includes identifying information as well as
 * authentication credentials.
 */
export type Credential = AuthConfig & Registry;

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
