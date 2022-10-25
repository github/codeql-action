import { Logger } from "./logging";

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
const LANGUAGE_ALIASES: { [lang: string]: Language } = {
  c: Language.cpp,
  "c++": Language.cpp,
  "c#": Language.csharp,
  typescript: Language.javascript,
};

// Translate from user input or GitHub's API names for languages to CodeQL's names for languages
export function parseLanguage(language: string): Language | undefined {
  // Normalise to lower case
  language = language.toLowerCase();

  // See if it's an exact match
  if (language in Language) {
    return language as Language;
  }

  // Check language aliases
  if (language in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[language];
  }

  return undefined;
}

export function isTracedLanguage(
  language: Language,
  isGoExtractionReconciliationEnabled: boolean,
  logger: Logger
): boolean {
  if ("CODEQL_EXTRACTOR_GO_BUILD_TRACING" in process.env) {
    logger.warning(
      "The CODEQL_EXTRACTOR_GO_BUILD_TRACING environment variable is deprecated and its behavior is now the default behavior."
    );
  }

  return (
    ["cpp", "java", "csharp", "swift"].includes(language) ||
    (isGoExtractionReconciliationEnabled && language === Language.go)
  );
}

export function isScannedLanguage(
  language: Language,
  isGoExtractionReconciliationEnabled: boolean,
  logger: Logger
): boolean {
  return !isTracedLanguage(
    language,
    isGoExtractionReconciliationEnabled,
    logger
  );
}
