export type Options<IdType extends number | string = number> = {
  id: IdType;
  privateKey: string;
  now?: number;
};

export type Result<IdType extends number | string = number> = {
  appId: IdType extends string ? string : number;
  expiration: number;
  token: string;
};

export default function githubAppJwt<T extends number | string = number>(options: Options<T>): Promise<Result<T>>;
