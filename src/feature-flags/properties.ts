import { getRepositoryProperties } from "../api-client";
import { Logger } from "../logging";
import { RepositoryNwo } from "../repository";
import { GitHubVariant, GitHubVersion } from "../util";

/**
 * Enumerates repository property names that have some meaning to us.
 */
export enum RepositoryPropertyName {
  DISABLE_OVERLAY = "github-codeql-disable-overlay",
  EXTRA_QUERIES = "github-codeql-extra-queries",
}

/** Parsed types of the known repository properties. */
type AllRepositoryProperties = {
  [RepositoryPropertyName.DISABLE_OVERLAY]: boolean;
  [RepositoryPropertyName.EXTRA_QUERIES]: string;
};

/** Parsed repository properties. */
export type RepositoryProperties = Partial<AllRepositoryProperties>;

/** Parsers that transform repository properties from the API response into typed values. */
const repositoryPropertyParsers: {
  [K in RepositoryPropertyName]: (
    name: K,
    value: string,
    logger: Logger,
  ) => AllRepositoryProperties[K];
} = {
  [RepositoryPropertyName.DISABLE_OVERLAY]: parseBooleanRepositoryProperty,
  [RepositoryPropertyName.EXTRA_QUERIES]: parseStringRepositoryProperty,
};

/**
 * A repository property has a name and a value.
 */
export interface GitHubRepositoryProperty {
  property_name: string;
  value: string;
}

/**
 * The API returns a list of `GitHubRepositoryProperty` objects.
 */
export type GitHubPropertiesResponse = GitHubRepositoryProperty[];

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

    const properties: RepositoryProperties = {};
    for (const property of remoteProperties) {
      if (property.property_name === undefined) {
        throw new Error(
          `Expected repository property object to have a 'property_name', but got: ${JSON.stringify(property)}`,
        );
      }

      if (typeof property.value !== "string") {
        throw new Error(
          `Expected repository property '${property.property_name}' to have a string value, but got: ${JSON.stringify(property)}`,
        );
      }

      if (isKnownPropertyName(property.property_name)) {
        setProperty(properties, property.property_name, property.value, logger);
      }
    }

    if (Object.keys(properties).length === 0) {
      logger.debug("No known repository properties were found.");
    } else {
      logger.debug(
        "Loaded the following values for the repository properties:",
      );
      for (const [property, value] of Object.entries(properties).sort(
        ([nameA], [nameB]) => nameA.localeCompare(nameB),
      )) {
        logger.debug(`  ${property}: ${value}`);
      }
    }

    return properties;
  } catch (e) {
    throw new Error(
      `Encountered an error while trying to determine repository properties: ${e}`,
    );
  }
}

/** Update the partial set of repository properties with the parsed value of the specified property. */
function setProperty<K extends RepositoryPropertyName>(
  properties: RepositoryProperties,
  name: K,
  value: string,
  logger: Logger,
): void {
  properties[name] = repositoryPropertyParsers[name](name, value, logger);
}

/** Parse a boolean repository property. */
function parseBooleanRepositoryProperty(
  name: string,
  value: string,
  logger: Logger,
): boolean {
  if (value !== "true" && value !== "false") {
    logger.warning(
      `Repository property '${name}' has unexpected value '${value}'. Expected 'true' or 'false'. Defaulting to false.`,
    );
  }
  return value === "true";
}

/** Parse a string repository property. */
function parseStringRepositoryProperty(_name: string, value: string): string {
  return value;
}

/** Set of known repository property names, for fast lookups. */
const KNOWN_REPOSITORY_PROPERTY_NAMES = new Set<string>(
  Object.values(RepositoryPropertyName),
);

/** Returns whether the given value is a known repository property name. */
function isKnownPropertyName(name: string): name is RepositoryPropertyName {
  return KNOWN_REPOSITORY_PROPERTY_NAMES.has(name);
}
