import { getRepositoryProperties } from "../api-client";
import { Logger } from "../logging";
import { RepositoryNwo } from "../repository";
import { GitHubVariant, GitHubVersion } from "../util";

/**
 * Enumerates repository property names that have some meaning to us.
 */
export enum RepositoryPropertyName {
  EXTRA_QUERIES = "github-codeql-extra-queries",
}

/**
 * A repository property has a name and a value.
 */
export interface RepositoryProperty {
  property_name: string;
  value: string;
}

/**
 * The API returns a list of `RepositoryProperty` objects.
 */
type GitHubPropertiesResponse = RepositoryProperty[];

/**
 * A partial mapping from `RepositoryPropertyName` to values.
 */
export type RepositoryProperties = Partial<
  Record<RepositoryPropertyName, string>
>;

/**
 * Retrieves all known repository properties from the API.
 *
 * @param logger The logger to use.
 * @param repositoryNwo Information about the repository for which to load properties.
 * @returns Returns a partial mapping from `RepositoryPropertyName` to values.
 */
export async function loadPropertiesFromApi(
  gitHubVersion: GitHubVersion,
  logger: Logger,
  repositoryNwo: RepositoryNwo,
): Promise<RepositoryProperties> {
  // TODO: To be safe for now; later we should replace this with a version check once we know
  // which version of GHES we expect this to be supported by.
  if (gitHubVersion.type === GitHubVariant.GHES) {
    return {};
  }

  try {
    const response = await getRepositoryProperties(repositoryNwo);
    const remoteProperties = response.data as GitHubPropertiesResponse;

    if (!Array.isArray(remoteProperties)) {
      throw new Error(
        `Expected repository properties API to return an array, but got: ${JSON.stringify(response.data)}`,
      );
    }

    logger.debug(
      `Retrieved ${remoteProperties.length} repository properties: ${remoteProperties.map((p) => p.property_name).join(", ")}`,
    );

    const knownProperties = new Set(Object.values(RepositoryPropertyName));
    const properties: RepositoryProperties = {};
    for (const property of remoteProperties) {
      if (property.property_name === undefined) {
        throw new Error(
          `Expected property object to have a 'property_name', but got: ${JSON.stringify(property)}`,
        );
      }

      if (
        knownProperties.has(property.property_name as RepositoryPropertyName)
      ) {
        properties[property.property_name] = property.value;
      }
    }

    logger.debug("Loaded the following values for the repository properties:");
    for (const [property, value] of Object.entries(properties).sort(
      ([nameA], [nameB]) => nameA.localeCompare(nameB),
    )) {
      logger.debug(`  ${property}: ${value}`);
    }

    return properties;
  } catch (e) {
    throw new Error(
      `Encountered an error while trying to determine repository properties: ${e}`,
    );
  }
}
