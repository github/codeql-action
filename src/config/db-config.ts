export interface ExcludeQueryFilter {
  exclude: Record<string, string[] | string>;
}

export interface IncludeQueryFilter {
  include: Record<string, string[] | string>;
}

export type QueryFilter = ExcludeQueryFilter | IncludeQueryFilter;

/**
 * Format of the config file supplied by the user.
 */
export interface UserConfig {
  name?: string;
  "disable-default-queries"?: boolean;
  queries?: Array<{
    name?: string;
    uses: string;
  }>;
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
