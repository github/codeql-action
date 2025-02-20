export type Payload = {
  iat: number;
  exp: number;
  iss: number | string;
};

export type Header = { alg: "RS256"; typ: "JWT" };

export type GetTokenOptions = {
  privateKey: string;
  payload: Payload;
};

export interface GetToken {
  (options: GetTokenOptions): Promise<string>;
}
