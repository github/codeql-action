import { ConfigurationError, getRequiredEnvParam } from "./util";

// A repository name with owner, parsed into its two parts
export interface RepositoryNwo {
  owner: string;
  repo: string;
}

/**
 * Get the repository name with owner from the environment variable
 * `GITHUB_REPOSITORY`.
 *
 * @returns The repository name with owner.
 */
export function getRepositoryNwo(): RepositoryNwo {
  return getRepositoryNwoFromEnv("GITHUB_REPOSITORY");
}

/**
 * Get the repository name with owner from the first environment variable that
 * is set and non-empty.
 *
 * @param envVarNames The names of the environment variables to check.
 * @returns The repository name with owner.
 * @throws ConfigurationError if none of the environment variables are set.
 */
export function getRepositoryNwoFromEnv(
  ...envVarNames: string[]
): RepositoryNwo {
  const envVarName = envVarNames.find((name) => process.env[name]);
  if (!envVarName) {
    throw new ConfigurationError(
      `None of the env vars ${envVarNames.join(", ")} are set`,
    );
  }
  return parseRepositoryNwo(getRequiredEnvParam(envVarName));
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
