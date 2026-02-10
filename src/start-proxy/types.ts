export interface Credential extends Registry {
  username?: string;
  password?: string;
  token?: string;
}

export interface Registry {
  type: string;
  host?: string;
  url?: string;
}

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

export type ValidRegistry<T extends Registry = Registry> = T & Address;
export type ValidCredential = ValidRegistry<Credential>;

export interface ProxyInfo {
  host: string;
  port: number;
  cert: string;
  registries: ValidRegistry[];
}
