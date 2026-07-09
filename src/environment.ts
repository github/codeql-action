/**
 * Environment variables used by the CodeQL Action.
 *
 * We recommend prefixing environment variables with `CODEQL_ACTION_`
 * to reduce the risk that they are overwritten by other steps.
 */
export enum EnvVar {
  /** Whether the `analyze` Action completes successfully. */
  ANALYZE_DID_COMPLETE_SUCCESSFULLY = "CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY",

  /** Whether the `autobuild` Action completes successfully. */
  AUTOBUILD_DID_COMPLETE_SUCCESSFULLY = "CODEQL_ACTION_AUTOBUILD_DID_COMPLETE_SUCCESSFULLY",

  /**
   * The verbosity level of the CLI. One of the following: `errors`, `warnings`, `progress`,
   * `progress+`, `progress++`, `progress+++`.
   */
  CLI_VERBOSITY = "CODEQL_VERBOSITY",

  /**
   * Set by Default Setup to the base branch of the PR being analysed, if analysing a PR.
   * This is needed because the `pull_request` context is not available for `dynamic` events.
   */
  CODE_SCANNING_BASE_BRANCH = "CODE_SCANNING_BASE_BRANCH",

  /**
   * Set by Default Setup to the full ref being analysed, if analysing a PR.
   * This is needed because the `pull_request` context is not available for `dynamic` events.
   */
  CODE_SCANNING_REF = "CODE_SCANNING_REF",

  /**
   * `PersistedVersionInfo` for the CodeQL CLI, so later Actions steps can reuse it instead of
   * invoking `codeql version` again.
   */
  CODEQL_VERSION_INFO = "CODEQL_ACTION_CLI_VERSION_INFO",

  /** Whether the CodeQL Action has invoked the Go autobuilder. */
  DID_AUTOBUILD_GOLANG = "CODEQL_ACTION_DID_AUTOBUILD_GOLANG",

  /**
   * Whether the CodeQL Action is using its own deprecated and non-standard way of scanning for
   * multiple languages.
   */
  FEATURE_MULTI_LANGUAGE = "CODEQL_ACTION_FEATURE_MULTI_LANGUAGE",

  /** Whether the CodeQL Action is using its own sandwiched workflow mechanism. */
  FEATURE_SANDWICH = "CODEQL_ACTION_FEATURE_SANDWICH",

  /**
   * Whether the CodeQL Action might combine SARIF output from several `interpret-results` runs for
   * the same language.
   */
  FEATURE_SARIF_COMBINE = "CODEQL_ACTION_FEATURE_SARIF_COMBINE",

  /** Whether the CodeQL Action will upload SARIF, not the CLI. */
  FEATURE_WILL_UPLOAD = "CODEQL_ACTION_FEATURE_WILL_UPLOAD",

  /** Whether the CodeQL Action has already warned the user about low disk space. */
  HAS_WARNED_ABOUT_DISK_SPACE = "CODEQL_ACTION_HAS_WARNED_ABOUT_DISK_SPACE",

  /** Whether the `setup-codeql` action has been run. */
  SETUP_CODEQL_ACTION_HAS_RUN = "CODEQL_ACTION_SETUP_CODEQL_HAS_RUN",

  /** Whether the init action has been run. */
  INIT_ACTION_HAS_RUN = "CODEQL_ACTION_INIT_HAS_RUN",

  /** Whether the deprecation warning for file coverage on PRs has been logged. */
  DID_LOG_FILE_COVERAGE_ON_PRS_DEPRECATION = "CODEQL_ACTION_DID_LOG_FILE_COVERAGE_ON_PRS_DEPRECATION",

  /**
   * Set to `true` to opt out of the upcoming change that skips file coverage
   * information on pull requests.
   */
  FILE_COVERAGE_ON_PRS = "CODEQL_ACTION_FILE_COVERAGE_ON_PRS",

  /** Whether the error for a deprecated version of the CodeQL Action was logged. */
  LOG_VERSION_DEPRECATION = "CODEQL_ACTION_DID_LOG_VERSION_DEPRECATION",

  /** UUID representing the current job run. */
  JOB_RUN_UUID = "JOB_RUN_UUID",

  /** Status for the entire job, submitted to the status report in `init-post` */
  JOB_STATUS = "CODEQL_ACTION_JOB_STATUS",

  /** The value of the `output` input for the analyze action. */
  SARIF_RESULTS_OUTPUT_DIR = "CODEQL_ACTION_SARIF_RESULTS_OUTPUT_DIR",

  /**
   * What percentage of the total amount of RAM over 8 GB that the Action should reserve for the
   * system.
   */
  SCALING_RESERVED_RAM_PERCENTAGE = "CODEQL_ACTION_SCALING_RESERVED_RAM_PERCENTAGE",

  /** Whether to suppress the warning if the current CLI will soon be unsupported. */
  SUPPRESS_DEPRECATED_SOON_WARNING = "CODEQL_ACTION_SUPPRESS_DEPRECATED_SOON_WARNING",

  /** Used to dictate or persist the temporary directory used by the CodeQL Action. */
  TEMP = "CODEQL_ACTION_TEMP",

  /** Whether to disable uploading SARIF results or status reports to the GitHub API */
  TEST_MODE = "CODEQL_ACTION_TEST_MODE",

  TESTING_ENVIRONMENT = "CODEQL_ACTION_TESTING_ENVIRONMENT",

  /** Semver of the CodeQL Action as specified in `package.json`. */
  VERSION = "CODEQL_ACTION_VERSION",

  /**
   * The time at which the first action (normally init) started executing.
   * If a workflow invokes a different action without first invoking the init
   * action (i.e. the upload action is being used by a third-party integrator)
   * then this variable will be assigned the start time of the action invoked
   * rather that the init action.
   */
  WORKFLOW_STARTED_AT = "CODEQL_WORKFLOW_STARTED_AT",

  /**
   * The path where we initially discovered the Go binary in the system path.
   * We check this later to ensure that it hasn't been tampered with by a late e.g. `setup-go` step.
   */
  GO_BINARY_LOCATION = "CODEQL_ACTION_GO_BINARY",

  /**
   * Used as an alternative to the `dependency-caching` input for the `init` Action.
   * Useful for experiments where it is easier to set an environment variable than
   * change the inputs to the Action.
   */
  DEPENDENCY_CACHING = "CODEQL_ACTION_DEPENDENCY_CACHING",

  /**
   * An optional string to add into the cache key used by dependency caching.
   * Useful for testing purposes where multiple caches may be stored in the same repository.
   */
  DEPENDENCY_CACHING_PREFIX = "CODEQL_ACTION_DEPENDENCY_CACHE_PREFIX",

  /** Used by the Java extractor option to enable minimizing dependency JARs. */
  JAVA_EXTRACTOR_MINIMIZE_DEPENDENCY_JARS = "CODEQL_EXTRACTOR_JAVA_OPTION_MINIMIZE_DEPENDENCY_JARS",

  /**
   * Whether to enable experimental extractors for CodeQL.
   */
  EXPERIMENTAL_FEATURES = "CODEQL_ENABLE_EXPERIMENTAL_FEATURES",

  /**
   * Whether and where to dump the processed SARIF file that would be uploaded, regardless of
   * whether the upload is disabled. This is intended for testing and debugging purposes.
   */
  SARIF_DUMP_DIR = "CODEQL_ACTION_SARIF_DUMP_DIR",

  /**
   * Whether to skip uploading SARIF results to GitHub. Intended for testing purposes.
   * This setting is more specific than `CODEQL_ACTION_TEST_MODE`, which implies this option.
   */
  SKIP_SARIF_UPLOAD = "CODEQL_ACTION_SKIP_SARIF_UPLOAD",

  /**
   * Whether to skip workflow validation. Intended for internal use, where we know that
   * the workflow is valid and validation is not necessary.
   */
  SKIP_WORKFLOW_VALIDATION = "CODEQL_ACTION_SKIP_WORKFLOW_VALIDATION",

  /**
   * Whether to tolerate failure to determine the git version (only applicable in test mode).
   * Intended for use in environments where git may not be installed, such as Docker containers.
   */
  TOLERATE_MISSING_GIT_VERSION = "CODEQL_ACTION_TOLERATE_MISSING_GIT_VERSION",

  /**
   * Used to store the analysis key used by the CodeQL Action. This is normally populated by
   * `getAnalysisKey`, but can also be set manually for testing and non-standard applications.
   */
  ANALYSIS_KEY = "CODEQL_ACTION_ANALYSIS_KEY",

  /** Used by Code Scanning Risk Assessment to communicate the assessment ID to the CodeQL Action. */
  RISK_ASSESSMENT_ID = "CODEQL_ACTION_RISK_ASSESSMENT_ID",
}

/**
 * Enumerates known GitHub Actions environment variables that we expect
 * to be set in a GitHub Actions environment.
 */
export enum ActionsEnvVars {
  GITHUB_ACTION_REPOSITORY = "GITHUB_ACTION_REPOSITORY",
  GITHUB_API_URL = "GITHUB_API_URL",
  GITHUB_EVENT_NAME = "GITHUB_EVENT_NAME",
  GITHUB_EVENT_PATH = "GITHUB_EVENT_PATH",
  GITHUB_JOB = "GITHUB_JOB",
  GITHUB_REF = "GITHUB_REF",
  GITHUB_REPOSITORY = "GITHUB_REPOSITORY",
  GITHUB_RUN_ATTEMPT = "GITHUB_RUN_ATTEMPT",
  GITHUB_RUN_ID = "GITHUB_RUN_ID",
  GITHUB_SERVER_URL = "GITHUB_SERVER_URL",
  GITHUB_SHA = "GITHUB_SHA",
  GITHUB_WORKFLOW = "GITHUB_WORKFLOW",
  RUNNER_ENVIRONMENT = "RUNNER_ENVIRONMENT",
  RUNNER_NAME = "RUNNER_NAME",
  RUNNER_OS = "RUNNER_OS",
  RUNNER_TEMP = "RUNNER_TEMP",
}

/** A type representing all known environment variables. */
export type KnownEnvVar = EnvVar | ActionsEnvVars;

/**
 * Gets an environment variable, but throws an error if it is not set.
 */
function getRequiredEnvVar(env: NodeJS.ProcessEnv, paramName: string): string {
  const value = env[paramName];
  if (value === undefined || value.length === 0) {
    throw new Error(`${paramName} environment variable must be set`);
  }
  return value;
}

/**
 * Get an environment parameter, but throw an error if it is not set.
 *
 * @deprecated Use `getRequired` of a `ReadOnlyEnv` or `Env` instance instead.
 */
export function getRequiredEnvParam(paramName: string): string {
  return getRequiredEnvVar(process.env, paramName);
}

/**
 * Gets an environment variable, but returns `undefined` if it is not set or empty.
 */
function getOptionalEnvVarFrom(
  env: NodeJS.ProcessEnv,
  paramName: string,
): string | undefined {
  const value = env[paramName];
  if (value?.trim().length === 0) {
    return undefined;
  }
  return value;
}

/**
 * Get an environment variable, but return `undefined` if it is not set or empty.
 *
 * @deprecated Use `getOptional` of a `ReadOnlyEnv` or `Env` instance instead.
 */
export function getOptionalEnvVar(paramName: string): string | undefined {
  return getOptionalEnvVarFrom(process.env, paramName);
}

/**
 * An abstraction around read-only environment variables, to allow abstracting away from `process.env`
 * in tests, while clearly signalling in regular code that the consumer of the `ReadOnlyEnv` instance
 * will only read from it.
 */
export class ReadOnlyEnv<T extends string | undefined = string | undefined> {
  constructor(protected readonly vars: Record<string, T>) {}

  /** Tries to get the value for `name` and throws if there isn't one. */
  public getRequired(name: string): string {
    return getRequiredEnvVar(this.vars, name);
  }

  /** Gets the value for `name`, or `undefined` if it isn't set or empty. */
  public getOptional(name: string): string | undefined {
    return getOptionalEnvVarFrom(this.vars, name);
  }

  /** Gets the entries of the underlying `ProcessEnv`. */
  public entries(): Array<[string, T]> {
    return Object.entries(this.vars);
  }
}

/**
 * A wrapper around an environment, to allow abstracting away from `process.env` in tests.
 * Use `ReadOnlyEnv` instead if you only plan to read from the environment.
 * This type allows writing to the environment.
 */
export class Env<
  T extends string | undefined = string | undefined,
> extends ReadOnlyEnv<T> {
  private changed: boolean = false;

  /** Sets an environment variable. */
  public set(name: string, value: T): void {
    this.vars[name] = value;
    this.changed = true;
  }

  /** Gets a value indicating whether `set` was called at least once. */
  public hasChanged(): boolean {
    return this.changed;
  }
}

/** Gets an `Env` instance for `env`, which is `process.env` by default. */
export function getEnv(env: NodeJS.ProcessEnv = process.env): Env {
  return new Env(env);
}
