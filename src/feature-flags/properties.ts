import { getRepositoryProperties } from "../api-client";
import { Logger } from "../logging";
import { RepositoryNwo } from "../repository";

/**
 * Enumerates repository property names that have some meaning to us.
 */
export enum RepositoryPropertyName {
  DISABLE_OVERLAY = "github-codeql-disable-overlay",
  EXTRA_QUERIES = "github-codeql-extra-queries",
}

/** Parsed types of the known repository properties. */
export type AllRepositoryProperties = {
  [RepositoryPropertyName.DISABLE_OVERLAY]: boolean;
  [RepositoryPropertyName.EXTRA_QUERIES]: string;
};

/** Parsed repository properties. */
export type RepositoryProperties = Partial<AllRepositoryProperties>;

/** Maps known repository properties to the type we expect to get from the API. */
export type RepositoryPropertyApiType = {
  [RepositoryPropertyName.DISABLE_OVERLAY]: string;
  [RepositoryPropertyName.EXTRA_QUERIES]: string;
};

/** The type of functions which take the `value` from the API and try to convert it to the type we want. */
export type PropertyParser<K extends RepositoryPropertyName> = (
  name: K,
  value: RepositoryPropertyApiType[K],
  logger: Logger,
) => AllRepositoryProperties[K];

/** Possible types of `value`s we get from the API. */
export type RepositoryPropertyValue = string | string[];

/** The type of repository property configurations. */
export type PropertyInfo<K extends RepositoryPropertyName> = {
  /** A validator which checks that the value received from the API is what we expect. */
  validate: (
    value: RepositoryPropertyValue,
  ) => value is RepositoryPropertyApiType[K];
  /** A `PropertyParser` for the property. */
  parse: PropertyParser<K>;
};

/** Determines whether a value from the API is a string or not. */
function isString(value: RepositoryPropertyValue): value is string {
  return typeof value === "string";
}

/** A repository property that we expect to contain a string value. */
const stringProperty = {
  validate: isString,
  parse: parseStringRepositoryProperty,
};

/** A repository property that we expect to contain a boolean value. */
const booleanProperty = {
  // The value from the API should come as a string, which we then parse into a boolean.
  validate: isString,
  parse: parseBooleanRepositoryProperty,
};

/** Parsers that transform repository properties from the API response into typed values. */
const repositoryPropertyParsers: {
  [K in RepositoryPropertyName]: PropertyInfo<K>;
} = {
  [RepositoryPropertyName.DISABLE_OVERLAY]: booleanProperty,
  [RepositoryPropertyName.EXTRA_QUERIES]: stringProperty,
};

/**
 * A repository property has a name and a value.
 */
export interface GitHubRepositoryProperty {
  property_name: string;
  value: RepositoryPropertyValue;
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
  logger: Logger,
  repositoryNwo: RepositoryNwo,
): Promise<RepositoryProperties> {
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

/**
 * Validate that `value` has the correct type for `K` and, if so, update the partial set of repository
 * properties with the parsed value of the specified property.
 */
function setProperty<K extends RepositoryPropertyName>(
  properties: RepositoryProperties,
  name: K,
  value: RepositoryPropertyValue,
  logger: Logger,
): void {
  const propertyOptions = repositoryPropertyParsers[name];

  // We perform the validation here for two reasons:
  // 1. This function is only called if `name` is a property we care about, to avoid throwing
  //    on unrelated properties that may use representations we do not support.
  // 2. The `propertyOptions.validate` function checks that the type of `value` we received from
  //    the API is what expect and narrows the type accordingly, allowing us to call `parse`.
  if (propertyOptions.validate(value)) {
    properties[name] = propertyOptions.parse(name, value, logger);
  } else {
    throw new Error(
      `Unexpected value for repository property '${name}' (${typeof value}), got: ${JSON.stringify(value)}`,
    );
  }
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
