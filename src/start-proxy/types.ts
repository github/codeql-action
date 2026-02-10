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

export interface ProxyInfo {
  host: string;
  port: number;
  cert: string;
  registries: Registry[];
}
