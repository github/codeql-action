import { ConfigurationError } from "./util";

// A repository name with owner, parsed into its two parts
export interface RepositoryNwo {
  owner: string;
  repo: string;
}

export function parseRepositoryNwo(input: string): RepositoryNwo {
  const parts = input.split("/");
  if (parts.length !== 2) {
    throw new ConfigurationError(`"${input}" is not a valid repository name`);
  }
  return {
    owner: parts[0],
    repo: parts[1],
  };
}
