/**
 * A lowercase string representing a language.
 */
export type Language = Lowercase<string>;

/**
 *  All the languages known to be supported by CodeQL
 */ 
export enum KnownLanguage {
  csharp = "csharp",
  cpp = "cpp",
  go = "go",
  java = "java",
  javascript = "javascript",
  python = "python",
  ruby = "ruby",
}

// Additional names for languages
const LANGUAGE_ALIASES: { [lang: string]: Language } = {
  c: KnownLanguage.cpp,
  "c++": KnownLanguage.cpp,
  "c#": KnownLanguage.csharp,
  typescript: KnownLanguage.javascript,
};

// Translate from user input or GitHub's API names for languages to CodeQL's names for languages
export function parseLanguage(language: string): Language {
  // Normalise to lower case
  language = language.toLowerCase();

  // See if it's an exact match
  if (language in KnownLanguage) {
    return language;
  }

  // Check language aliases
  if (language in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[language];
  }

  return language;
}

export function isTracedLanguage(language: Language): boolean {
  return (
    [KnownLanguage.cpp, KnownLanguage.java, KnownLanguage.csharp].includes(language as any) ||
    (process.env["CODEQL_EXTRACTOR_GO_BUILD_TRACING"] === "on" &&
      language === KnownLanguage.go)
  );
}

export function isScannedLanguage(language: Language): boolean {
  return !isTracedLanguage(language);
}
