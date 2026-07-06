import * as yaml from "js-yaml";

import { ConfigurationError } from "../util";

export type RegistryConfigWithCredentials = RegistryConfigNoCredentials & {
  // Token to use when downloading packs from this registry.
  token: string;
};

/**
 * The list of registries and the associated pack globs that determine where each
 * pack can be downloaded from.
 */
export interface RegistryConfigNoCredentials {
  // URL of a package registry, eg- https://ghcr.io/v2/
  url: string;

  // List of globs that determine which packs are associated with this registry.
  packages: string[] | string;

  // Kind of registry, either "github" or "docker". Default is "docker".
  // "docker" refers specifically to the GitHub Container Registry, which is the usual way of sharing CodeQL packs.
  // "github" refers to packs published as content in a GitHub repository. This kind of registry is used in scenarios
  // where GHCR is not available, such as certain GHES environments.
  kind?: "github" | "docker";
}

export function parseRegistries(
  registriesInput: string | undefined,
): RegistryConfigWithCredentials[] | undefined {
  try {
    return registriesInput
      ? (yaml.load(registriesInput) as RegistryConfigWithCredentials[])
      : undefined;
  } catch {
    throw new ConfigurationError(
      "Invalid registries input. Must be a YAML string.",
    );
  }
}

export function parseRegistriesWithoutCredentials(
  registriesInput?: string,
): RegistryConfigNoCredentials[] | undefined {
  return parseRegistries(registriesInput)?.map((r) => {
    const { url, packages, kind } = r;
    return { url, packages, kind };
  });
}
