import knownLanguagesData from "./builtin.json";

/** A language to analyze with CodeQL. */
export type Language = string;

/** A language built into the `defaults.json` CodeQL distribution. */
export enum BuiltInLanguage {
  actions = "actions",
  cpp = "cpp",
  csharp = "csharp",
  go = "go",
  java = "java",
  javascript = "javascript",
  python = "python",
  ruby = "ruby",
  rust = "rust",
  swift = "swift",
}

/** Java-specific environment variable names that we may care about. */
export enum JavaEnvVars {
  JAVA_HOME = "JAVA_HOME",
  JAVA_TOOL_OPTIONS = "JAVA_TOOL_OPTIONS",
  JDK_JAVA_OPTIONS = "JDK_JAVA_OPTIONS",
  _JAVA_OPTIONS = "_JAVA_OPTIONS",
}

const builtInLanguageSet = new Set<string>(knownLanguagesData.languages);

export function isBuiltInLanguage(
  language: string,
): language is BuiltInLanguage {
  return builtInLanguageSet.has(language);
}

/**
 * Parses a built-in language name or alias.
 */
export function parseBuiltInLanguage(
  language: string,
): BuiltInLanguage | undefined {
  language = language.trim().toLowerCase();
  language =
    knownLanguagesData.aliases[
      language as keyof typeof knownLanguagesData.aliases
    ] ?? language;
  if (isBuiltInLanguage(language)) {
    return language;
  }
  return undefined;
}
