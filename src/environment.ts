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

  /** Whether the CodeQL Action has invoked the Go autobuilder. */
  DID_AUTOBUILD_GOLANG = "CODEQL_ACTION_DID_AUTOBUILD_GOLANG",

  /**
   * Whether to disable the SARIF post-processing in the Action that removes duplicate locations from
   * notifications in the `run[].invocations[].toolExecutionNotifications` SARIF property.
   */
  DISABLE_DUPLICATE_LOCATION_FIX = "CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX",

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

  /** Whether the init action has been run. */
  INIT_ACTION_HAS_RUN = "CODEQL_ACTION_INIT_HAS_RUN",

  /**
   * For MacOS. Result of `csrutil status` to determine whether System Integrity
   * Protection is enabled.
   */
  IS_SIP_ENABLED = "CODEQL_ACTION_IS_SIP_ENABLED",

  /** UUID representing the current job run. */
  JOB_RUN_UUID = "JOB_RUN_UUID",

  /** Status for the entire job, submitted to the status report in `init-post` */
  JOB_STATUS = "CODEQL_ACTION_JOB_STATUS",

  ODASA_TRACER_CONFIGURATION = "ODASA_TRACER_CONFIGURATION",

  /**
   * What percentage of the total amount of RAM over 8 GB that the Action should reserve for the
   * system.
   */
  SCALING_RESERVED_RAM_PERCENTAGE = "CODEQL_ACTION_SCALING_RESERVED_RAM_PERCENTAGE",

  /** Whether to suppress the warning if the current CLI will soon be unsupported. */
  SUPPRESS_DEPRECATED_SOON_WARNING = "CODEQL_ACTION_SUPPRESS_DEPRECATED_SOON_WARNING",

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
}
