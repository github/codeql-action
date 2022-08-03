import { MatchKind } from './internal-match-kind';
import { Pattern } from './internal-pattern';
/**
 * Given an array of patterns, returns an array of paths to search.
 * Duplicates and paths under other included paths are filtered out.
 */
export declare function getSearchPaths(patterns: Pattern[]): string[];
/**
 * Matches the patterns against the path
 */
export declare function match(patterns: Pattern[], itemPath: string): MatchKind;
/**
 * Checks whether to descend further into the directory
 */
export declare function partialMatch(patterns: Pattern[], itemPath: string): boolean;
