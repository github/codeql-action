import { ActionState } from "../action-common";
import { Feature } from "../feature-flags";
import {
  RepositoryProperties,
  RepositoryPropertyName,
} from "../feature-flags/properties";

/** Enumerates input names. */
export enum InputName {
  Tools = "tools",
}

/** Enumerates input sources. */
export enum InputSource {
  Workflow = "workflow",
  RepositoryProperty = "repository-property",
}

/**
 * Represents an effective input to the CodeQL Action. That is,
 * the input value that was computed or selected from multiple sources.
 */
export type ComputedInput = {
  /** The name of the property. */
  name: InputName;
  /** The value of the property. */
  value: string;
  /** The source of the property. */
  source: InputSource;
};

/**
 * Gets the computed `tools` input. This comes from either the workflow or
 * the repository property.
 *
 * @param action The Action state.
 * @param repositoryProperties The values of known repository properties.
 * @returns The computed input or `undefined` if there is no input.
 */
export async function getToolsInput(
  action: ActionState<["Logger", "Actions", "FeatureFlags"]>,
  repositoryProperties: Partial<RepositoryProperties>,
): Promise<ComputedInput | undefined> {
  const name = InputName.Tools;
  const input = action.actions.getOptionalInput(name);
  const propertyValue = repositoryProperties[RepositoryPropertyName.TOOLS];
  const allowRepositoryProperty = await action.features.getValue(
    Feature.ToolsRepositoryProperty,
  );

  // The repository property takes precedence if it starts with an '!'.
  if (allowRepositoryProperty && propertyValue?.startsWith("!")) {
    action.logger.info(
      `Using ${name} input from repository property (enforced): ${propertyValue}`,
    );
    return {
      name,
      // Drop the '!' from the value.
      value: propertyValue.substring(1),
      source: InputSource.RepositoryProperty,
    };
  }

  // Otherwise, the input from the workflow takes precedence.
  if (input !== undefined) {
    action.logger.info(`Using ${name} input from workflow: ${input}`);
    return { name, value: input, source: InputSource.Workflow };
  }

  // Use the repository property if there's no workflow input.
  if (allowRepositoryProperty && propertyValue !== undefined) {
    action.logger.info(
      `Using ${name} input from repository property: ${propertyValue}`,
    );
    return {
      name,
      value: propertyValue,
      source: InputSource.RepositoryProperty,
    };
  }

  // There's no input.
  return undefined;
}
