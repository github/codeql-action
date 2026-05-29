import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "./feature-flags/properties";
import { Logger } from "./logging";

/**
 * Resolves the effective tools input by combining the workflow input and repository properties.
 * The explicit `tools` workflow input takes precedence. If none is provided,
 * falls back to the repository property (if set).
 *
 * @param toolsWorkflowInput - The value of the `tools` workflow input, if provided.
 * @param repositoryProperties - The parsed repository properties.
 * @param logger - Logger for outputting resolution messages.
 * @returns The effective tools input value.
 */
export function resolveToolsInput(
  toolsWorkflowInput: string | undefined,
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
  if (toolsPropertyValue) {
    logger.info(
      `Setting tools: ${toolsPropertyValue} based on the '${RepositoryPropertyName.TOOLS}' repository property.`,
    );
    return toolsPropertyValue;
  }

  return undefined;
}
