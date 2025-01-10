"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvVar = void 0;
/**
 * Environment variables used by the CodeQL Action.
 *
 * We recommend prefixing environment variables with `CODEQL_ACTION_`
 * to reduce the risk that they are overwritten by other steps.
 */
var EnvVar;
(function (EnvVar) {
    /** Whether the `analyze` Action completes successfully. */
    EnvVar["ANALYZE_DID_COMPLETE_SUCCESSFULLY"] = "CODEQL_ACTION_ANALYZE_DID_COMPLETE_SUCCESSFULLY";
    /** Whether the `autobuild` Action completes successfully. */
    EnvVar["AUTOBUILD_DID_COMPLETE_SUCCESSFULLY"] = "CODEQL_ACTION_AUTOBUILD_DID_COMPLETE_SUCCESSFULLY";
    /**
     * The verbosity level of the CLI. One of the following: `errors`, `warnings`, `progress`,
     * `progress+`, `progress++`, `progress+++`.
     */
    EnvVar["CLI_VERBOSITY"] = "CODEQL_VERBOSITY";
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
    /** Whether the init action has been run. */
    EnvVar["INIT_ACTION_HAS_RUN"] = "CODEQL_ACTION_INIT_HAS_RUN";
    /** Whether the error for a deprecated version of the CodeQL Action was logged. */
    EnvVar["LOG_VERSION_DEPRECATION"] = "CODEQL_ACTION_DID_LOG_VERSION_DEPRECATION";
    /**
     * For macOS. Result of `csrutil status` to determine whether System Integrity
     * Protection is enabled.
     */
    EnvVar["IS_SIP_ENABLED"] = "CODEQL_ACTION_IS_SIP_ENABLED";
    /** UUID representing the current job run. */
    EnvVar["JOB_RUN_UUID"] = "JOB_RUN_UUID";
    /** Status for the entire job, submitted to the status report in `init-post` */
    EnvVar["JOB_STATUS"] = "CODEQL_ACTION_JOB_STATUS";
    EnvVar["ODASA_TRACER_CONFIGURATION"] = "ODASA_TRACER_CONFIGURATION";
    /** The value of the `output` input for the analyze action. */
    EnvVar["SARIF_RESULTS_OUTPUT_DIR"] = "CODEQL_ACTION_SARIF_RESULTS_OUTPUT_DIR";
    /**
     * What percentage of the total amount of RAM over 8 GB that the Action should reserve for the
     * system.
     */
    EnvVar["SCALING_RESERVED_RAM_PERCENTAGE"] = "CODEQL_ACTION_SCALING_RESERVED_RAM_PERCENTAGE";
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
    /**
     * The path where we initially discovered the Go binary in the system path.
     * We check this later to ensure that it hasn't been tampered with by a late e.g. `setup-go` step.
     */
    EnvVar["GO_BINARY_LOCATION"] = "CODEQL_ACTION_GO_BINARY";
    /**
     * Used as an alternative to the `dependency-caching` input for the `init` Action.
     * Useful for experiments where it is easier to set an environment variable than
     * change the inputs to the Action.
     */
    EnvVar["DEPENDENCY_CACHING"] = "CODEQL_ACTION_DEPENDENCY_CACHING";
    /**
     * An optional string to add into the cache key used by dependency caching.
     * Useful for testing purposes where multiple caches may be stored in the same repository.
     */
    EnvVar["DEPENDENCY_CACHING_PREFIX"] = "CODEQL_ACTION_DEPENDENCY_CACHE_PREFIX";
})(EnvVar || (exports.EnvVar = EnvVar = {}));
//# sourceMappingURL=environment.js.map