import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "./feature-flags/properties";
import { Logger } from "./logging";

/**
 * Resolves the effective tools input by combining the workflow input and repository properties.
 * The explicit `tools` workflow input takes precedence. If none is provided,
 * falls back to the repository property (if set and enabled for this workflow).
 *
 * @param toolsWorkflowInput - The value of the `tools` workflow input, if provided.
 * @param allowRepositoryPropertyFallback - Whether the repository property fallback is enabled.
 * @param repositoryProperties - The parsed repository properties.
 * @param logger - Logger for outputting resolution messages.
 * @returns The effective tools input value.
 */
export function resolveToolsInput(
  toolsWorkflowInput: string | undefined,
  allowRepositoryPropertyFallback: boolean,
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

  if (!allowRepositoryPropertyFallback) {
    if (toolsPropertyValue) {
      logger.info(
        `No explicit tools input was provided. Ignoring '${RepositoryPropertyName.TOOLS}' repository property because it is only supported for dynamic workflows.`,
      );
    }
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
