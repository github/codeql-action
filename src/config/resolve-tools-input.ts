import {
  RepositoryProperties,
  RepositoryPropertyName,
  ToolsModeRepositoryPropertyValue,
} from "../feature-flags/properties";
import { Logger } from "../logging";

/**
 * Resolves the effective tools input by combining the workflow input and repository properties.
 * The explicit `tools` workflow input takes precedence. If none is provided,
 * falls back to the repository property (if set). The optional
 * `github-codeql-tools-mode` repository property controls whether this fallback
 * applies to all workflows (`enforce`) or only dynamic workflows (`dynamic`).
 *
 * @param toolsWorkflowInput - The value of the `tools` workflow input, if provided.
 * @param isDynamicWorkflow - Whether the current workflow is dynamic.
 * @param repositoryProperties - The parsed repository properties.
 * @param logger - Logger for outputting resolution messages.
 * @returns The effective tools input value.
 */
export function resolveToolsInput(
  toolsWorkflowInput: string | undefined,
  isDynamicWorkflow: boolean,
  repositoryProperties: RepositoryProperties,
  logger: Logger,
): string | undefined {
  if (toolsWorkflowInput) {
    logger.info(
      `Setting tools: ${toolsWorkflowInput} based on workflow input.`,
    );
    return toolsWorkflowInput;
  }

  const toolsPropertyValue = repositoryProperties[RepositoryPropertyName.TOOLS];
  const toolsMode =
    repositoryProperties[RepositoryPropertyName.TOOLS_MODE] ??
    ToolsModeRepositoryPropertyValue.Enforce;

  if (
    toolsPropertyValue &&
    toolsMode === ToolsModeRepositoryPropertyValue.Dynamic &&
    !isDynamicWorkflow
  ) {
    logger.info(
      `Ignoring '${RepositoryPropertyName.TOOLS}' repository property because '${RepositoryPropertyName.TOOLS_MODE}' is set to '${toolsMode}' and this is not a dynamic workflow.`,
    );
    return undefined;
  }

  if (toolsPropertyValue) {
    logger.info(
      `Setting tools: ${toolsPropertyValue} based on the '${RepositoryPropertyName.TOOLS}' repository property.`,
    );
    return toolsPropertyValue;
  }

  return undefined;
}
