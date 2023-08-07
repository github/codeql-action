"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvVar = void 0;
var EnvVar;
(function (EnvVar) {
    /** Whether the `analyze` Action completes successfully. */
    EnvVar["ANALYZE_DID_COMPLETE_SUCCESSFULLY"] = "CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY";
    /** Whether the CodeQL Action has invoked the Go autobuilder. */
    EnvVar["DID_AUTOBUILD_GOLANG"] = "CODEQL_ACTION_DID_AUTOBUILD_GOLANG";
    /**
     * Whether to disable the SARIF post-processing in the Action that removes duplicate locations from
     * notifications in the `run[].invocations[].toolExecutionNotifications` SARIF property.
     */
    EnvVar["DISABLE_DUPLICATE_LOCATION_FIX"] = "CODEQL_ACTION_DISABLE_DUPLICATE_LOCATION_FIX";
    /**
     * Whether the CodeQL Action is using its own deprecated and non-standard way of scanning for
     * multiple languages.
     */
    EnvVar["FEATURE_MULTI_LANGUAGE"] = "CODEQL_ACTION_FEATURE_MULTI_LANGUAGE";
    /** Whether the CodeQL Action is using its own sandwiched workflow mechanism. */
    EnvVar["FEATURE_SANDWICH"] = "CODEQL_ACTION_FEATURE_SANDWICH";
    /**
     * Whether the CodeQL Action might combine SARIF output from several `interpret-results` runs for
     * the same language.
     */
    EnvVar["FEATURE_SARIF_COMBINE"] = "CODEQL_ACTION_FEATURE_SARIF_COMBINE";
    /** Whether the CodeQL Action will upload SARIF, not the CLI. */
    EnvVar["FEATURE_WILL_UPLOAD"] = "CODEQL_ACTION_FEATURE_WILL_UPLOAD";
    /** Whether the CodeQL Action has already warned the user about low disk space. */
    EnvVar["HAS_WARNED_ABOUT_DISK_SPACE"] = "CODEQL_ACTION_HAS_WARNED_ABOUT_DISK_SPACE";
    /** UUID representing the current job run. */
    EnvVar["JOB_RUN_UUID"] = "JOB_RUN_UUID";
    EnvVar["ODASA_TRACER_CONFIGURATION"] = "ODASA_TRACER_CONFIGURATION";
    /** Whether to suppress the warning if the current CLI will soon be unsupported. */
    EnvVar["SUPPRESS_DEPRECATED_SOON_WARNING"] = "CODEQL_ACTION_SUPPRESS_DEPRECATED_SOON_WARNING";
    /** Whether to disable uploading SARIF results or status reports to the GitHub API */
    EnvVar["TEST_MODE"] = "CODEQL_ACTION_TEST_MODE";
    EnvVar["TESTING_ENVIRONMENT"] = "CODEQL_ACTION_TESTING_ENVIRONMENT";
    /** Semver of the CodeQL Action as specified in `package.json`. */
    EnvVar["VERSION"] = "CODEQL_ACTION_VERSION";
    /**
     * The time at which the first action (normally init) started executing.
     * If a workflow invokes a different action without first invoking the init
     * action (i.e. the upload action is being used by a third-party integrator)
     * then this variable will be assigned the start time of the action invoked
     * rather that the init action.
     */
    EnvVar["WORKFLOW_STARTED_AT"] = "CODEQL_WORKFLOW_STARTED_AT";
})(EnvVar || (exports.EnvVar = EnvVar = {}));
//# sourceMappingURL=environment.js.map