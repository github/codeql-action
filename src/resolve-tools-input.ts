import { getOptionalInput } from "./actions-util";
import {
  loadRepositoryProperties,
  RepositoryPropertyName,
} from "./feature-flags/properties";
import { Logger } from "./logging";
import { RepositoryNwo } from "./repository";

/**
 * Resolves the effective tools input by combining workflow input and repository properties.
 * The explicit `tools` workflow input takes precedence. If none is provided,
 * fall back to the repository property (if set).
 *
 * @param repositoryNwo - The Name-With-Owner of the repository, used for fetching repository properties
 * @param logger - Logger for outputting resolution messages
 * @returns The effective tools input value
 */
export async function resolveToolsInput(
  repositoryNwo: RepositoryNwo,
  logger: Logger,
): Promise<string | undefined> {
  const repositoryPropertiesResult = await loadRepositoryProperties(
    repositoryNwo,
    logger,
  );
  const toolsWorkflowInput = getOptionalInput("tools");
  let toolsPropertyValue: string | undefined;
  if (repositoryPropertiesResult) {
    if (repositoryPropertiesResult.isSuccess()) {
      logger.debug(
        `Loaded repository properties: ${Object.keys(repositoryPropertiesResult.value).join(", ")}`,
      );
      toolsPropertyValue =
        RepositoryPropertyName.TOOLS in repositoryPropertiesResult.value
          ? (repositoryPropertiesResult.value[
              RepositoryPropertyName.TOOLS
            ] as string)
          : undefined;
    } else {
      logger.warning(
        `Failed to load repository properties: ${repositoryPropertiesResult.value}`,
      );
      toolsPropertyValue = undefined;
    }
  }
  const effectiveToolsInput = toolsWorkflowInput || toolsPropertyValue;

  // Log the source of the tools input for transparency
  if (effectiveToolsInput) {
    if (toolsWorkflowInput) {
      logger.info(
        `Setting tools: ${effectiveToolsInput} based on workflow input.`,
      );
    } else {
      logger.info(
        `Setting tools: ${effectiveToolsInput} based on the '${RepositoryPropertyName.TOOLS}' repository property.`,
      );
    }
  }

  return effectiveToolsInput;
}
