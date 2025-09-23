import * as path from "path";

import * as semver from "semver";

import * as errorMessages from "../error-messages";
import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "../feature-flags/properties";
import { Language } from "../languages";
import { Logger } from "../logging";
import { cloneObject, ConfigurationError, prettyPrintPack } from "../util";

export interface ExcludeQueryFilter {
  exclude: Record<string, string[] | string>;
}

export interface IncludeQueryFilter {
  include: Record<string, string[] | string>;
}

export type QueryFilter = ExcludeQueryFilter | IncludeQueryFilter;

export interface QuerySpec {
  name?: string;
  uses: string;
}

/**
 * Format of the config file supplied by the user.
 */
export interface UserConfig {
  name?: string;
  "disable-default-queries"?: boolean;
  queries?: QuerySpec[];
  "paths-ignore"?: string[];
  paths?: string[];

  // If this is a multi-language analysis, then the packages must be split by
  // language. If this is a single language analysis, then no split by
  // language is necessary.
  packs?: Record<string, string[]> | string[];

  // Set of query filters to include and exclude extra queries based on
  // codeql query suite `include` and `exclude` properties
  "query-filters"?: QueryFilter[];
}

/**
 * Represents additional configuration data from a source other than
 * a configuration file.
 */
interface Augmentation<T> {
  /** Whether or not the `input` combines with data in the base config. */
  combines: boolean;
  /** The additional input data. */
  input?: T;
}

/**
 * Describes how to augment the user config with inputs from the action.
 *
 * When running a CodeQL analysis, the user can supply a config file. When
 * running a CodeQL analysis from a GitHub action, the user can supply a
 * config file _and_ a set of inputs.
 *
 * The inputs from the action are used to augment the user config before
 * passing the user config to the CodeQL CLI invocation.
 */
export interface AugmentationProperties {
  /**
   * Whether or not the queries input combines with the queries in the config.
   */
  queriesInputCombines: boolean;

  /**
   * The queries input from the `with` block of the action declaration
   */
  queriesInput?: QuerySpec[];

  /**
   * Whether or not the packs input combines with the packs in the config.
   */
  packsInputCombines: boolean;

  /**
   * The packs input from the `with` block of the action declaration
   */
  packsInput?: string[];

  /**
   * Extra queries from the corresponding repository property.
   */
  repoPropertyQueries: Augmentation<QuerySpec[]>;
}

/**
 * The default, empty augmentation properties. This is most useful
 * for tests.
 */
export const defaultAugmentationProperties: AugmentationProperties = {
  queriesInputCombines: false,
  packsInputCombines: false,
  packsInput: undefined,
  queriesInput: undefined,
  repoPropertyQueries: {
    combines: false,
    input: undefined,
  },
};

/**
 * The convention in this action is that an input value that is prefixed with a '+' will
 * be combined with the corresponding value in the config file.
 *
 * Without a '+', an input value will override the corresponding value in the config file.
 *
 * @param inputValue The input value to process.
 * @returns true if the input value should replace the corresponding value in the config file,
 *          false if it should be appended.
 */
function shouldCombine(inputValue?: string): boolean {
  return !!inputValue?.trim().startsWith("+");
}

export type Packs = Partial<Record<Language, string[]>>;

export interface Pack {
  name: string;
  version?: string;
  path?: string;
}

/**
 * Pack names must be in the form of `scope/name`, with only alpha-numeric characters,
 * and `-` allowed as long as not the first or last char.
 **/
const PACK_IDENTIFIER_PATTERN = (function () {
  const alphaNumeric = "[a-z0-9]";
  const alphaNumericDash = "[a-z0-9-]";
  const component = `${alphaNumeric}(${alphaNumericDash}*${alphaNumeric})?`;
  return new RegExp(`^${component}/${component}$`);
})();

/**
 * Validates that this package specification is syntactically correct.
 * It may not point to any real package, but after this function returns
 * without throwing, we are guaranteed that the package specification
 * is roughly correct.
 *
 * The CLI itself will do a more thorough validation of the package
 * specification.
 *
 * A package specification looks like this:
 *
 * `scope/name@version:path`
 *
 * Version and path are optional.
 *
 * @param packStr the package specification to verify.
 * @param configFile Config file to use for error reporting
 */
export function parsePacksSpecification(packStr: string): Pack {
  if (typeof packStr !== "string") {
    throw new ConfigurationError(errorMessages.getPacksStrInvalid(packStr));
  }

  packStr = packStr.trim();
  const atIndex = packStr.indexOf("@");
  const colonIndex = packStr.indexOf(":", atIndex);
  const packStart = 0;
  const versionStart = atIndex + 1 || undefined;
  const pathStart = colonIndex + 1 || undefined;
  const packEnd = Math.min(
    atIndex > 0 ? atIndex : Infinity,
    colonIndex > 0 ? colonIndex : Infinity,
    packStr.length,
  );
  const versionEnd = versionStart
    ? Math.min(colonIndex > 0 ? colonIndex : Infinity, packStr.length)
    : undefined;
  const pathEnd = pathStart ? packStr.length : undefined;

  const packName = packStr.slice(packStart, packEnd).trim();
  const version = versionStart
    ? packStr.slice(versionStart, versionEnd).trim()
    : undefined;
  const packPath = pathStart
    ? packStr.slice(pathStart, pathEnd).trim()
    : undefined;

  if (!PACK_IDENTIFIER_PATTERN.test(packName)) {
    throw new ConfigurationError(errorMessages.getPacksStrInvalid(packStr));
  }
  if (version) {
    try {
      new semver.Range(version);
    } catch {
      // The range string is invalid. OK to ignore the caught error
      throw new ConfigurationError(errorMessages.getPacksStrInvalid(packStr));
    }
  }

  if (
    packPath &&
    (path.isAbsolute(packPath) ||
      // Permit using "/" instead of "\" on Windows
      // Use `x.split(y).join(z)` as a polyfill for `x.replaceAll(y, z)` since
      // if we used a regex we'd need to escape the path separator on Windows
      // which seems more awkward.
      path.normalize(packPath).split(path.sep).join("/") !==
        packPath.split(path.sep).join("/"))
  ) {
    throw new ConfigurationError(errorMessages.getPacksStrInvalid(packStr));
  }

  if (!packPath && pathStart) {
    // 0 length path
    throw new ConfigurationError(errorMessages.getPacksStrInvalid(packStr));
  }

  return {
    name: packName,
    version,
    path: packPath,
  };
}

export function validatePackSpecification(pack: string) {
  return prettyPrintPack(parsePacksSpecification(pack));
}

// Exported for testing
export function parsePacksFromInput(
  rawPacksInput: string | undefined,
  languages: Language[],
  packsInputCombines: boolean,
): Packs | undefined {
  if (!rawPacksInput?.trim()) {
    return undefined;
  }

  if (languages.length > 1) {
    throw new ConfigurationError(
      "Cannot specify a 'packs' input in a multi-language analysis. Use a codeql-config.yml file instead and specify packs by language.",
    );
  } else if (languages.length === 0) {
    throw new ConfigurationError(
      "No languages specified. Cannot process the packs input.",
    );
  }

  rawPacksInput = rawPacksInput.trim();
  if (packsInputCombines) {
    rawPacksInput = rawPacksInput.trim().substring(1).trim();
    if (!rawPacksInput) {
      throw new ConfigurationError(
        errorMessages.getConfigFilePropertyError(
          undefined,
          "packs",
          "A '+' was used in the 'packs' input to specify that you wished to add some packs to your CodeQL analysis. However, no packs were specified. Please either remove the '+' or specify some packs.",
        ),
      );
    }
  }

  return {
    [languages[0]]: rawPacksInput.split(",").reduce((packs, pack) => {
      packs.push(validatePackSpecification(pack));
      return packs;
    }, [] as string[]),
  };
}

/**
 * Calculates how the codeql config file needs to be augmented before passing
 * it to the CLI. The reason this is necessary is the codeql-action can be called
 * with extra inputs from the workflow. These inputs are not part of the config
 * and the CLI does not know about these inputs so we need to inject them into
 * the config file sent to the CLI.
 *
 * @param rawPacksInput The packs input from the action configuration.
 * @param rawQueriesInput The queries input from the action configuration.
 * @param repositoryProperties The dictionary of repository properties.
 * @param languages The languages that the config file is for. If the packs input
 *    is non-empty, then there must be exactly one language. Otherwise, an
 *    error is thrown.
 *
 * @returns The properties that need to be augmented in the config file.
 *
 * @throws An error if the packs input is non-empty and the languages input does
 *     not have exactly one language.
 */
export async function calculateAugmentation(
  rawPacksInput: string | undefined,
  rawQueriesInput: string | undefined,
  repositoryProperties: RepositoryProperties,
  languages: Language[],
): Promise<AugmentationProperties> {
  const packsInputCombines = shouldCombine(rawPacksInput);
  const packsInput = parsePacksFromInput(
    rawPacksInput,
    languages,
    packsInputCombines,
  );
  const queriesInputCombines = shouldCombine(rawQueriesInput);
  const queriesInput = parseQueriesFromInput(
    rawQueriesInput,
    queriesInputCombines,
  );

  const repoExtraQueries =
    repositoryProperties[RepositoryPropertyName.EXTRA_QUERIES];
  const repoExtraQueriesCombines = shouldCombine(repoExtraQueries);
  const repoPropertyQueries = {
    combines: repoExtraQueriesCombines,
    input: parseQueriesFromInput(
      repoExtraQueries,
      repoExtraQueriesCombines,
      new ConfigurationError(
        errorMessages.getRepoPropertyError(
          RepositoryPropertyName.EXTRA_QUERIES,
          errorMessages.getEmptyCombinesError(),
        ),
      ),
    ),
  };

  return {
    packsInputCombines,
    packsInput: packsInput?.[languages[0]],
    queriesInput,
    queriesInputCombines,
    repoPropertyQueries,
  };
}

function parseQueriesFromInput(
  rawQueriesInput: string | undefined,
  queriesInputCombines: boolean,
  errorToThrow?: ConfigurationError,
) {
  if (!rawQueriesInput) {
    return undefined;
  }

  const trimmedInput = queriesInputCombines
    ? rawQueriesInput.trim().slice(1).trim()
    : (rawQueriesInput?.trim() ?? "");
  if (queriesInputCombines && trimmedInput.length === 0) {
    if (errorToThrow) {
      throw errorToThrow;
    }
    throw new ConfigurationError(
      errorMessages.getConfigFilePropertyError(
        undefined,
        "queries",
        "A '+' was used in the 'queries' input to specify that you wished to add some packs to your CodeQL analysis. However, no packs were specified. Please either remove the '+' or specify some packs.",
      ),
    );
  }
  return trimmedInput.split(",").map((query) => ({ uses: query.trim() }));
}

/**
 * Combines queries from various configuration sources.
 *
 * @param logger The logger to use.
 * @param config The loaded configuration file (either `config-file` or `config` input).
 * @param augmentationProperties Additional configuration data from other sources.
 * @returns Returns `augmentedConfig` with `queries` set to the computed array of queries.
 */
function combineQueries(
  logger: Logger,
  config: UserConfig,
  augmentationProperties: AugmentationProperties,
): QuerySpec[] {
  const result: QuerySpec[] = [];

  // Query settings obtained from the repository properties have the highest precedence.
  if (
    augmentationProperties.repoPropertyQueries &&
    augmentationProperties.repoPropertyQueries.input
  ) {
    logger.info(
      `Found query configuration in the repository properties (${RepositoryPropertyName.EXTRA_QUERIES}): ` +
        `${augmentationProperties.repoPropertyQueries.input.map((q) => q.uses).join(", ")}`,
    );

    // If there are queries configured as a repository property, these may be organisational
    // settings. If they don't allow combining with other query configurations, return just the
    // ones configured in the repository properties.
    if (!augmentationProperties.repoPropertyQueries.combines) {
      logger.info(
        `The queries configured in the repository properties don't allow combining with other query settings. ` +
          `Any queries configured elsewhere will be ignored.`,
      );
      return augmentationProperties.repoPropertyQueries.input;
    } else {
      // Otherwise, add them to the query array and continue.
      result.push(...augmentationProperties.repoPropertyQueries.input);
    }
  }

  // If there is a `queries` input to the Action, it has the next highest precedence.
  if (augmentationProperties.queriesInput) {
    // If there is a `queries` input and `queriesInputCombines` is `false`, then we don't
    // combine it with the queries configured in the configuration file (if any). That is the
    // original behaviour of this property. However, we DO combine it with any queries that
    // we obtained from the repository properties, since that may be enforced by the organisation.
    if (!augmentationProperties.queriesInputCombines) {
      return result.concat(augmentationProperties.queriesInput);
    } else {
      // If they combine, add them to the query array and continue.
      result.push(...augmentationProperties.queriesInput);
    }
  }

  // If we get to this point, we either don't have any extra configuration inputs or all of them
  // allow themselves to be combined with the settings from the configuration file.
  if (config.queries) {
    result.push(...config.queries);
  }

  return result;
}

export function generateCodeScanningConfig(
  logger: Logger,
  originalUserInput: UserConfig,
  augmentationProperties: AugmentationProperties,
): UserConfig {
  // make a copy so we can modify it
  const augmentedConfig = cloneObject(originalUserInput);

  // Inject the queries from the input
  augmentedConfig.queries = combineQueries(
    logger,
    augmentedConfig,
    augmentationProperties,
  );
  logger.debug(
    `Combined queries: ${augmentedConfig.queries?.map((q) => q.uses).join(",")}`,
  );
  if (augmentedConfig.queries?.length === 0) {
    delete augmentedConfig.queries;
  }

  // Inject the packs from the input
  if (augmentationProperties.packsInput) {
    if (augmentationProperties.packsInputCombines) {
      // At this point, we already know that this is a single-language analysis
      if (Array.isArray(augmentedConfig.packs)) {
        augmentedConfig.packs = (augmentedConfig.packs || []).concat(
          augmentationProperties.packsInput,
        );
      } else if (!augmentedConfig.packs) {
        augmentedConfig.packs = augmentationProperties.packsInput;
      } else {
        // At this point, we know there is only one language.
        // If there were more than one language, an error would already have been thrown.
        const language = Object.keys(augmentedConfig.packs)[0];
        augmentedConfig.packs[language] = augmentedConfig.packs[
          language
        ].concat(augmentationProperties.packsInput);
      }
    } else {
      augmentedConfig.packs = augmentationProperties.packsInput;
    }
  }
  if (Array.isArray(augmentedConfig.packs) && !augmentedConfig.packs.length) {
    delete augmentedConfig.packs;
  }

  return augmentedConfig;
}
