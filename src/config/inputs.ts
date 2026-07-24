import { ActionState } from "../action-common";
import { Feature } from "../feature-flags";
import {
  RepositoryProperties,
  RepositoryPropertyName,
  StringRepositoryPropertyNames,
} from "../feature-flags/properties";

/** Enumerates input names. */
export enum InputName {
  ConfigFile = "config-file",
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
  /** The value of the property. */
  value: string;
  /** The source of the property. */
  source: InputSource;
};

/**
 * Represents options for how to compute an input.
 */
export interface ComputedInputOptions {
  /**
   * Whether the FF for the repository property (if any) is enabled.
   */
  repositoryPropertyFeatureEnabled: boolean;
  /**
   * The name of the repository property to try and get the input value from.
   */
  repositoryPropertyName: StringRepositoryPropertyNames;
  /**
   * Whether the repository property value may start with `!` to take precedence
   * over any input value provided in the workflow file.
   */
  allowForcedRepositoryPropertyValue: boolean;
}

/**
 * Gets the computed input for `name`. This comes from either the workflow or
 * the repository property.
 *
 * @param action The Action state.
 * @param repositoryProperties The values of known repository properties.
 * @param name The name of the input to compute.
 * @param options Options for how to compute the input value.
 *
 * @returns The computed input or `undefined` if there is no input.
 */
export async function getComputedInput(
  action: ActionState<["Logger", "Actions", "FeatureFlags"]>,
  repositoryProperties: RepositoryProperties,
  name: InputName,
  options: ComputedInputOptions,
): Promise<ComputedInput | undefined> {
  const input = action.actions.getOptionalInput(name);
  const propertyValue = repositoryProperties[options.repositoryPropertyName];

  // The repository property takes precedence if it starts with an '!'.
  if (
    options.repositoryPropertyFeatureEnabled &&
    options.allowForcedRepositoryPropertyValue &&
    propertyValue?.startsWith("!")
  ) {
    action.logger.info(
      `Using ${name} input from repository property (enforced): ${propertyValue}`,
    );
    return {
      // Drop the '!' from the value.
      value: propertyValue.substring(1),
      source: InputSource.RepositoryProperty,
    };
  }

  // Otherwise, the input from the workflow takes precedence.
  if (input !== undefined) {
    action.logger.info(`Using ${name} input from workflow: ${input}`);
    return { value: input, source: InputSource.Workflow };
  }

  // Use the repository property if there's no workflow input.
  if (options.repositoryPropertyFeatureEnabled && propertyValue !== undefined) {
    action.logger.info(
      `Using ${name} input from repository property: ${propertyValue}`,
    );
    return {
      value: propertyValue,
      source: InputSource.RepositoryProperty,
    };
  } else if (propertyValue !== undefined) {
    action.logger.info(
      `Ignoring ${name} input from repository property, because the corresponding feature flag is disabled.`,
    );
  }

  // There's no input.
  return undefined;
}

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
  const allowRepositoryProperty = await action.features.getValue(
    Feature.ToolsRepositoryProperty,
  );
  return getComputedInput(action, repositoryProperties, InputName.Tools, {
    repositoryPropertyFeatureEnabled: allowRepositoryProperty,
    allowForcedRepositoryPropertyValue: true,
    repositoryPropertyName: RepositoryPropertyName.TOOLS,
  });
}
