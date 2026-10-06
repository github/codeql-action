import { ActionState } from "../action-common";
import { isRunningLocalAction } from "../actions-util";
import { ActionsEnvVars } from "../environment";

/** The NWO of the standard CodeQL Action repository. */
export const CODEQL_DEFAULT_ACTION_REPOSITORY = "github/codeql-action";

/**
 * Retrieves the NWO of the repository that the CodeQL Action is loaded from.
 * Typically, this will be `github/codeql-action`, but it may be something else for
 * forks of the Action or in environments other than GitHub.com.
 *
 * If this function detects that we are running the Action locally (e.g. in tests),
 * then we default to `CODEQL_DEFAULT_ACTION_REPOSITORY`.
 */
export function getCodeQLActionRepository(
  action: ActionState<["ReadOnlyEnv", "Logger"]>,
): string {
  if (isRunningLocalAction(action.env)) {
    // This handles the case where the Action does not come from an Action repository,
    // e.g. our integration tests which use the Action code from the current checkout.
    // In these cases, the GITHUB_ACTION_REPOSITORY environment variable is not set.
    action.logger.info(
      "The CodeQL Action is checked out locally. Using the default CodeQL Action repository.",
    );
    return CODEQL_DEFAULT_ACTION_REPOSITORY;
  }

  return action.env.getRequired(ActionsEnvVars.GITHUB_ACTION_REPOSITORY);
}
