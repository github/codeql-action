/**
 * Environment variables to be set by codeql-action and used by the
 * CLI.
 */
export enum EnvVar {
  /**
   * Semver of the codeql-action as specified in package.json.
   */
  VERSION = "CODEQL_ACTION_VERSION",

  /**
   * If set to a truthy value, then the codeql-action might combine SARIF
   * output from several `interpret-results` runs for the same Language.
   */
  FEATURE_SARIF_COMBINE = "CODEQL_ACTION_FEATURE_SARIF_COMBINE",

  /**
   * If set to the "true" string, then the codeql-action will upload SARIF,
   * not the cli.
   */
  FEATURE_WILL_UPLOAD = "CODEQL_ACTION_FEATURE_WILL_UPLOAD",

  /**
   * If set to the "true" string, then the codeql-action is using its
   * own deprecated and non-standard way of scanning for multiple
   * languages.
   */
  FEATURE_MULTI_LANGUAGE = "CODEQL_ACTION_FEATURE_MULTI_LANGUAGE",

  /**
   * If set to the "true" string, then the codeql-action is using its
   * own sandwiched workflow mechanism
   */
  FEATURE_SANDWICH = "CODEQL_ACTION_FEATURE_SANDWICH",
}

/**
 * Environment variable that is set to true when the CodeQL Action has invoked
 * the Go autobuilder.
 */
export const CODEQL_ACTION_DID_AUTOBUILD_GOLANG =
  "CODEQL_ACTION_DID_AUTOBUILD_GOLANG";

/**
 * This environment variable is set to true when the `analyze` Action
 * completes successfully.
 */
export const CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY =
  "CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY";

export const CODEQL_ACTION_TESTING_ENVIRONMENT =
  "CODEQL_ACTION_TESTING_ENVIRONMENT";

/** Used to disable uploading SARIF results or status reports to the GitHub API */
export const CODEQL_ACTION_TEST_MODE = "CODEQL_ACTION_TEST_MODE";

/**
 * Used to disable the SARIF post-processing in the Action that removes duplicate locations from
 * notifications in the `run[].invocations[].toolExecutionNotifications` SARIF property.
 */
export const CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX =
  "CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX";

/**
 * The time at which the first action (normally init) started executing.
 * If a workflow invokes a different action without first invoking the init
 * action (i.e. the upload action is being used by a third-party integrator)
 * then this variable will be assigned the start time of the action invoked
 * rather that the init action.
 */
export const CODEQL_WORKFLOW_STARTED_AT = "CODEQL_WORKFLOW_STARTED_AT";

export const ODASA_TRACER_CONFIGURATION = "ODASA_TRACER_CONFIGURATION";
