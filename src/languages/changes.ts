import { minimatch } from "minimatch";

import type { FileDiff } from "../diff-informed";

import { BuiltInLanguage } from ".";

/**
 * Represents configurations for how to detect whether changes relate to a given analysis.
 */
export type ChangePatterns = {
  /**
   * A list of glob patterns.
   *
   * If a changed file has matches one of these, we conclude that files relevant to the
   * analysis have changed.
   *
   * If undefined, all changes are considered relevant.
   */
  patterns?: string[];

  /**
   * A list of glob patterns to exclude from `patterns`. Allows specific patterns to be excluded
   * that would otherwise be included by `patterns`.
   *
   * If a changed file matches one of `patterns` and `exclude`, then it is not considered
   * relevant to the analysis.
   */
  exclude?: string[];
};

/**
 * A mapping from all {@link BuildInLanguage}s to a {@link ChangePatterns} configuration.
 */
export const CHANGE_PATTERNS: Record<BuiltInLanguage, ChangePatterns> = {
  [BuiltInLanguage.actions]: {},
  [BuiltInLanguage.cpp]: {},
  [BuiltInLanguage.csharp]: {},
  [BuiltInLanguage.go]: {},
  [BuiltInLanguage.java]: {},
  [BuiltInLanguage.javascript]: {},
  [BuiltInLanguage.python]: {},
  [BuiltInLanguage.ruby]: {},
  [BuiltInLanguage.rust]: {},
  [BuiltInLanguage.swift]: {},
};

/**
 * Decides whether {@link val} matches any of {@link patterns}. Returns early
 * as soon as a pattern matches.
 */
export function matchPatterns(val: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (minimatch(val, pattern, { matchBase: true })) {
      return true;
    }
  }

  return false;
}

/**
 * Decides whether {@link diff} matches the configuration in {@link changePatterns}.
 *
 * @param changePatterns The configuration of patterns to match {@link diff}'s path against.
 * @param diff A description of a change.
 */
export function relevantChangeFor(
  changePatterns: ChangePatterns,
  diff: FileDiff,
): boolean {
  // If `patterns` is defined and none match, then the change is not relevant.
  if (
    changePatterns.patterns !== undefined &&
    !matchPatterns(diff.filename, changePatterns.patterns)
  ) {
    return false;
  }

  // At this point we have decided that the change is relevant, either because no
  // patterns are configured (all changes are relevant) or because one of the configured
  // patterns matched. Let's check if `exclude` patterns are configured and if any match.
  // If so, then we don't consider the change relevant after all.
  if (
    changePatterns.exclude !== undefined &&
    matchPatterns(diff.filename, changePatterns.exclude)
  ) {
    return false;
  }

  // The change is relevant and none of the `exclude` patterns matched (or none were configured).
  return true;
}

/**
 * Decides whether at least one of the given {@link diffs} matches the configuration for {@link language}
 * from {@link CHANGE_PATTERNS}.
 *
 * @param language The language to check for changes for.
 * @param diffs All changes to check.
 */
export function relevantChangesFor(
  language: BuiltInLanguage,
  diffs: FileDiff[],
): boolean {
  for (const diff of diffs) {
    if (relevantChangeFor(CHANGE_PATTERNS[language], diff)) {
      return true;
    }
  }

  return false;
}
