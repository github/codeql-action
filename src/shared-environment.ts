export const ODASA_TRACER_CONFIGURATION = 'ODASA_TRACER_CONFIGURATION';
// The time at which the first action (normally init) started executing.
// If a workflow invokes a different action without first invoking the init
// action (i.e. the upload action is being used by a third-party integrator)
// then this variable will be assigned the start time of the action invoked
// rather that the init action.
export const CODEQL_WORKFLOW_STARTED_AT = 'CODEQL_WORKFLOW_STARTED_AT';
