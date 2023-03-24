"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ODASA_TRACER_CONFIGURATION = exports.CODEQL_WORKFLOW_STARTED_AT = exports.CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX = exports.CODEQL_ACTION_TEST_MODE = exports.CODEQL_ACTION_TESTING_ENVIRONMENT = exports.CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY = exports.CODEQL_ACTION_DID_AUTOBUILD_GOLANG = void 0;
/**
 * Environment variable that is set to true when the CodeQL Action has invoked
 * the Go autobuilder.
 */
exports.CODEQL_ACTION_DID_AUTOBUILD_GOLANG = "CODEQL_ACTION_DID_AUTOBUILD_GOLANG";
/**
 * This environment variable is set to true when the `analyze` Action
 * completes successfully.
 */
exports.CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY = "CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY";
exports.CODEQL_ACTION_TESTING_ENVIRONMENT = "CODEQL_ACTION_TESTING_ENVIRONMENT";
/** Used to disable uploading SARIF results or status reports to the GitHub API */
exports.CODEQL_ACTION_TEST_MODE = "CODEQL_ACTION_TEST_MODE";
/**
 * Used to disable the SARIF post-processing in the Action that removes duplicate locations from
 * notifications in the `run[].invocations[].toolExecutionNotifications` SARIF property.
 */
exports.CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX = "CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX";
/**
 * The time at which the first action (normally init) started executing.
 * If a workflow invokes a different action without first invoking the init
 * action (i.e. the upload action is being used by a third-party integrator)
 * then this variable will be assigned the start time of the action invoked
 * rather that the init action.
 */
exports.CODEQL_WORKFLOW_STARTED_AT = "CODEQL_WORKFLOW_STARTED_AT";
exports.ODASA_TRACER_CONFIGURATION = "ODASA_TRACER_CONFIGURATION";
//# sourceMappingURL=shared-environment.js.map