export interface VersionInfo {
  version: string;
  features?: { [name: string]: boolean };
  /**
   * The overlay version helps deal with backward incompatible changes for
   * overlay analysis. When a precompiled query pack reports the same overlay
   * version as the CodeQL CLI, we can use the CodeQL CLI to perform overlay
   * analysis with that pack. Otherwise, if the overlay versions are different,
   * or if either the pack or the CLI does not report an overlay version,
   * we need to revert to non-overlay analysis.
   */
  overlayVersion?: number;
}
