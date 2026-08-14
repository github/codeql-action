import * as json from "../json";

/**
 * The JSON schema of the expected output of the `codeql version` command.
 */
export const versionInfoBaseSchema = {
  version: json.string,
  features: json.optional(json.object({})),
  /**
   * The overlay version helps deal with backward incompatible changes for
   * overlay analysis. When a precompiled query pack reports the same overlay
   * version as the CodeQL CLI, we can use the CodeQL CLI to perform overlay
   * analysis with that pack. Otherwise, if the overlay versions are different,
   * or if either the pack or the CLI does not report an overlay version,
   * we need to revert to non-overlay analysis.
   */
  overlayVersion: json.optional(json.number),
} as const satisfies json.Schema;

/**
 * The base type that describes the expected output of the `codeql version` command.
 * This type is partially derived from {@link versionInfoBaseSchema}.
 */
export type VersionInfoBase = json.FromSchema<typeof versionInfoBaseSchema>;

/**
 * The full type that describes the expected output of the `codeql version` command.
 * This type is partially derived from {@link VersionInfoBase}.
 */
export type VersionInfo = VersionInfoBase & {
  // `features` remains optional, but the more specific type takes precedence
  // over the `any` type derived by `FromSchema`.
  features?: { [name: string]: boolean };
};
