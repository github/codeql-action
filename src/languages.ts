// All the languages supported by CodeQL
export enum Language {
  csharp = "csharp",
  cpp = "cpp",
  go = "go",
  java = "java",
  javascript = "javascript",
  python = "python",
  ruby = "ruby",
  swift = "swift",
}

// Additional names for languages
export const LANGUAGE_ALIASES: { [lang: string]: Language } = {
  c: Language.cpp,
  "c++": Language.cpp,
  "c#": Language.csharp,
  kotlin: Language.java,
  typescript: Language.javascript,
};

export type LanguageOrAlias = Language | keyof typeof LANGUAGE_ALIASES;

export const KOTLIN_SWIFT_BYPASS = ["kotlin", "swift"];

// Translate from user input or GitHub's API names for languages to CodeQL's names for languages
export function parseLanguage(language: string): LanguageOrAlias | undefined {
  // Normalise to lower case
  language = language.toLowerCase();

  // See if it's an exact match
  if (language in Language) {
    return language as Language;
  }

  // Check language aliases
  if (language in LANGUAGE_ALIASES) {
    return language;
  }

  return undefined;
}

export function isTracedLanguage(language: Language): boolean {
  return [
    Language.cpp,
    Language.csharp,
    Language.go,
    Language.java,
    Language.swift,
  ].includes(language);
}

export function isScannedLanguage(language: Language): boolean {
  return !isTracedLanguage(language);
}
