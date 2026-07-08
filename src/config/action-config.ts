import type { AnalysisKind } from "../analyses";
import type { CachingKind } from "../caching-utils";
import type { RepositoryProperties } from "../feature-flags/properties";
import type { Language } from "../languages";
import type { OverlayDatabaseMode } from "../overlay/overlay-database-mode";
import type { BuildMode, GitHubVersion } from "../util";

import type { ExcludeQueryFilter, UserConfig } from "./db-config";

/**
 * Format of the CodeQL Action configuration state that is persisted
 * between steps of the CodeQL Action in a CodeQL workflow.
 */
export interface Config {
  /**
   * The version of the CodeQL Action that the configuration is for.
   */
  version: string;
  /**
   * Set of analysis kinds that are enabled.
   */
  analysisKinds: AnalysisKind[];
  /**
   * Set of languages to run analysis for.
   */
  languages: Language[];
  /**
   * Build mode, if set. Currently only a single build mode is supported per job.
   */
  buildMode: BuildMode | undefined;
  /**
   * A unaltered copy of the original user input.
   * Mainly intended to be used for status reporting.
   * If any field is useful for the actual processing
   * of the action then consider pulling it out to a
   * top-level field above.
   */
  originalUserInput: UserConfig;
  /**
   * Directory to use for temporary files that should be
   * deleted at the end of the job.
   */
  tempDir: string;
  /**
   * Path of the CodeQL executable.
   */
  codeQLCmd: string;
  /**
   * Version of GitHub we are talking to.
   */
  gitHubVersion: GitHubVersion;
  /**
   * The location where CodeQL databases should be stored.
   */
  dbLocation: string;
  /**
   * Specifies whether we are debugging mode and should try to produce extra
   * output for debugging purposes when possible.
   */
  debugMode: boolean;
  /**
   * Specifies the name of the debugging artifact if we are in debug mode.
   */
  debugArtifactName: string;
  /**
   * Specifies the name of the database in the debugging artifact.
   */
  debugDatabaseName: string;
  /**
   * The configuration we computed by combining `originalUserInput` with `augmentationProperties`,
   * as well as adjustments made to it based on unsupported or required options.
   */
  computedConfig: UserConfig;

  /**
   * Partial map from languages to locations of TRAP caches for that language.
   * If a key is omitted, then TRAP caching should not be used for that language.
   */
  trapCaches: { [language: Language]: string };

  /**
   * Time taken to download TRAP caches. Used for status reporting.
   */
  trapCacheDownloadTime: number;

  /** A value indicating how dependency caching should be used. */
  dependencyCachingEnabled: CachingKind;

  /** The keys of caches that we restored, if any. */
  dependencyCachingRestoredKeys: string[];

  /**
   * Extra query exclusions to append to the config.
   */
  extraQueryExclusions: ExcludeQueryFilter[];

  /**
   * The overlay database mode to use.
   */
  overlayDatabaseMode: OverlayDatabaseMode;

  /**
   * Whether to use caching for overlay databases. If it is true, the action
   * will upload the created overlay-base database to the actions cache, and
   * download an overlay-base database from the actions cache before it creates
   * a new overlay database. If it is false, the action assumes that the
   * workflow will be responsible for managing database storage and retrieval.
   *
   * This property has no effect unless `overlayDatabaseMode` is `Overlay` or
   * `OverlayBase`.
   */
  useOverlayDatabaseCaching: boolean;

  /**
   * Whether the overlay database mode was set explicitly.
   */
  overlayModeSetExplicitly: boolean;

  /**
   * A partial mapping from repository properties that affect us to their values.
   */
  repositoryProperties: RepositoryProperties;

  /**
   * Whether to enable file coverage information.
   */
  enableFileCoverageInformation: boolean;
}
