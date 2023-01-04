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
 * The time at which the first action (normally init) started executing.
 * If a workflow invokes a different action without first invoking the init
 * action (i.e. the upload action is being used by a third-party integrator)
 * then this variable will be assigned the start time of the action invoked
 * rather that the init action.
 */
export const CODEQL_WORKFLOW_STARTED_AT = "CODEQL_WORKFLOW_STARTED_AT";

export const ODASA_TRACER_CONFIGURATION = "ODASA_TRACER_CONFIGURATION";
