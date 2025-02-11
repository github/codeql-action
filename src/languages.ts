// All the languages supported by CodeQL
export enum Language {
  actions = "actions",
  csharp = "csharp",
  cpp = "cpp",
  go = "go",
  java = "java",
  javascript = "javascript",
  python = "python",
  ruby = "ruby",
  rust = "rust",
  swift = "swift",
}

// Additional names for languages
export const LANGUAGE_ALIASES: { [lang: string]: Language } = {
  c: Language.cpp,
  "c++": Language.cpp,
  "c#": Language.csharp,
  kotlin: Language.java,
  typescript: Language.javascript,
  "javascript-typescript": Language.javascript,
  "java-kotlin": Language.java,
};

/**
 * Translate from user input or GitHub's API names for languages to CodeQL's
 * names for languages.
 *
 * @param language The language to translate.
 * @returns A language supported by CodeQL, an alias for a language, or
 * `undefined` if the input language cannot be parsed into a language supported
 * by CodeQL.
 */
export function parseLanguage(language: string): Language | undefined {
  // Normalise to lower case
  language = language.trim().toLowerCase();

  // See if it's an exact match
  if (language in Language) {
    return language as Language;
  }

  // Check language aliases, but return the original language name,
  // the alias will be resolved later.
  if (language in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[language];
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
