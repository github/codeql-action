/**
 * @name Some environment variables may not exist in default setup workflows
 * @id javascript/codeql-action/default-setup-env-vars
 * @kind problem
 * @severity warning
 */

import javascript

bindingset[envVar]
predicate isSafeForDefaultSetup(string envVar) {
  // Ignore internal Code Scanning environment variables
  envVar.matches("CODE_SCANNING_%") or
  envVar.matches("CODEQL_%") or
  envVar.matches("CODESCANNING_%") or
  envVar.matches("LGTM_%") or
  // We flag up usage of potentially unsafe parts of the GitHub event in `default-setup-event-context.ql`.
  envVar = "GITHUB_EVENT_PATH" or
  // The following environment variables are known to be safe for use with default setup
  envVar =
    [
      "GITHUB_ACTION_REF", "GITHUB_ACTION_REPOSITORY", "GITHUB_ACTOR", "GITHUB_API_URL",
      "GITHUB_BASE_REF", "GITHUB_EVENT_NAME", "GITHUB_JOB", "GITHUB_RUN_ATTEMPT", "GITHUB_RUN_ID",
      "GITHUB_SHA", "GITHUB_REPOSITORY", "GITHUB_SERVER_URL", "GITHUB_TOKEN", "GITHUB_WORKFLOW",
      "GITHUB_WORKSPACE", "GOFLAGS", "ImageVersion", "JAVA_TOOL_OPTIONS", "RUNNER_ARCH",
      "RUNNER_ENVIRONMENT", "RUNNER_NAME", "RUNNER_OS", "RUNNER_TEMP", "RUNNER_TOOL_CACHE"
    ]
}

predicate envVarRead(DataFlow::Node node, string envVar) {
  node =
    any(DataFlow::PropRead read |
      read = NodeJSLib::process().getAPropertyRead("env").getAPropertyRead() and
      envVar = read.getPropertyName()
    ) or
  node =
    any(DataFlow::CallNode call |
      call.getCalleeName().matches("get%EnvParam") and
      envVar = call.getArgument(0).getStringValue()
    )
}

from DataFlow::Node read, string envVar
where
  envVarRead(read, envVar) and
  not read.getFile().getBaseName().matches("%.test.ts") and
  not isSafeForDefaultSetup(envVar)
select read,
  "The environment variable " + envVar +
    " may not exist in default setup workflows. If all uses are safe, add it to the list of " +
    "environment variables that are known to be safe in " +
    "'queries/default-setup-environment-variables.ql'. If this use is safe but others are not, " +
    "dismiss this alert as a false positive."
