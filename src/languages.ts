// All the languages supported by CodeQL
export const ALL_LANGUAGES = ['csharp', 'cpp', 'go', 'java', 'javascript', 'python'] as const;
export type Language = (typeof ALL_LANGUAGES)[number];

// Additional names for languages
const LANGUAGE_ALIASES: {[lang: string]: Language} = {
  'c': 'cpp',
  'c++': 'cpp',
  'c#': 'csharp',
  'typescript': 'javascript',
};

// Translate from user input or GitHub's API names for languages to CodeQL's names for languages
export function parseLanguage(language: string): Language | undefined {
  // Normalise to lower case
  language = language.toLowerCase();

  // See if it's an exact match
  const parsedLanguage = ALL_LANGUAGES.find(l => l === language);
  if (parsedLanguage !== undefined) {
    return parsedLanguage;
  }

  // Check language aliases
  if (language in LANGUAGE_ALIASES) {
    return LANGUAGE_ALIASES[language];
  }

  return undefined;
}


export function isTracedLanguage(language: Language): boolean {
  return ['cpp', 'java', 'csharp'].includes(language);
}

export function isScannedLanguage(language: Language): boolean {
  return !isTracedLanguage(language);
}
