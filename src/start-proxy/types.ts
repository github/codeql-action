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
